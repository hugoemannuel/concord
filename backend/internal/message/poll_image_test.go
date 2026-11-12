package message

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Regressão: a imagem da resposta da enquete era uma URL de fora carregada
// direto por todo mundo que via a enquete (o site recebia o IP de cada um).
// Agora o servidor baixa a imagem na criação e serve de /api/poll-images/.

const pngHead = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"

// fakeImageFetcher devolve o corpo de cada URL (ou erro, se não conhece).
type fakeImageFetcher struct {
	bodies map[string]string
	asked  []string
}

func (f *fakeImageFetcher) Open(_ context.Context, raw string) (io.ReadCloser, error) {
	f.asked = append(f.asked, raw)
	body, ok := f.bodies[raw]
	if !ok {
		return nil, errors.New("fora do ar")
	}
	return io.NopCloser(strings.NewReader(body)), nil
}

func newPollImagesEnv(t *testing.T, bodies map[string]string, room bool) (*PollImages, *media.Store, *fakeImageFetcher) {
	t.Helper()
	files, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	fetch := &fakeImageFetcher{bodies: bodies}
	return NewPollImages(fetch, files, fakeSpace{ok: room}), files, fetch
}

func pollInput(answers ...PollAnswerInput) CreatePollInput {
	return CreatePollInput{Question: "qual?", Answers: answers, DurationHours: 24}
}

func TestPollImagesBaixaAImagemEServeDoServidor(t *testing.T) {
	p, files, _ := newPollImagesEnv(t, map[string]string{"https://x.com/a.png": pngHead}, true)
	out := p.Localize(context.Background(), pollInput(
		PollAnswerInput{Text: "a", ImageURL: " https://x.com/a.png "},
		PollAnswerInput{Text: "b"},
	))
	got := out.Answers[0].ImageURL
	id, ok := strings.CutPrefix(got, PollImagePath)
	if !ok || uuid.Validate(id) != nil {
		t.Fatalf("image_url = %q, quero %s<uuid>", got, PollImagePath)
	}
	if f, err := files.Open(id); err != nil {
		t.Fatalf("arquivo não foi guardado: %v", err)
	} else {
		f.Close()
	}
	if out.Answers[1].ImageURL != "" {
		t.Fatalf("resposta sem imagem ganhou %q", out.Answers[1].ImageURL)
	}
}

func TestPollImagesQueNaoDaParaUsarSaemSemImagem(t *testing.T) {
	bodies := map[string]string{"https://x.com/pagina": "<html><script>alert(1)</script>"}
	p, files, _ := newPollImagesEnv(t, bodies, true)
	out := p.Localize(context.Background(), pollInput(
		PollAnswerInput{Text: "a", ImageURL: "https://x.com/pagina"},
		PollAnswerInput{Text: "b", ImageURL: "https://fora.do.ar/b.png"},
	))
	for i, a := range out.Answers {
		if a.ImageURL != "" {
			t.Errorf("resposta %d: image_url = %q, quero vazio", i, a.ImageURL)
		}
	}
	if list, _ := files.List(); len(list) != 0 {
		t.Fatalf("sobrou arquivo recusado: %+v", list)
	}
}

func TestPollImagesSemEspacoNoDiscoNaoBaixa(t *testing.T) {
	p, _, fetch := newPollImagesEnv(t, map[string]string{"https://x.com/a.png": pngHead}, false)
	out := p.Localize(context.Background(), pollInput(PollAnswerInput{Text: "a", ImageURL: "https://x.com/a.png"}))
	if out.Answers[0].ImageURL != "" || len(fetch.asked) != 0 {
		t.Fatalf("image_url = %q, buscas = %v", out.Answers[0].ImageURL, fetch.asked)
	}
}

// O que a validação vai recusar de qualquer jeito não é baixado.
func TestPollImagesNaoBaixaOQueAValidacaoRecusa(t *testing.T) {
	p, _, fetch := newPollImagesEnv(t, map[string]string{}, true)
	local := PollImagePath + uuid.NewString()
	in := pollInput(
		PollAnswerInput{Text: "a", Emoji: "🍕", ImageURL: "https://x.com/a.png"},
		PollAnswerInput{Text: "b", ImageURL: "http://x.com/b.png"},
		PollAnswerInput{Text: "c", ImageURL: local},
		PollAnswerInput{Text: "d", ImageURL: "https://x.com/" + strings.Repeat("a", PollImageURLMaxLength)},
	)
	out := p.Localize(context.Background(), in)
	for i := range in.Answers {
		if out.Answers[i].ImageURL != in.Answers[i].ImageURL {
			t.Errorf("resposta %d mudou: %q", i, out.Answers[i].ImageURL)
		}
	}
	if len(fetch.asked) != 0 {
		t.Fatalf("baixou %v", fetch.asked)
	}
}

func TestPollImagesNilTiraAsImagensDeFora(t *testing.T) {
	var p *PollImages
	out := p.Localize(context.Background(), pollInput(PollAnswerInput{Text: "a", ImageURL: "https://x.com/a.png"}))
	if out.Answers[0].ImageURL != "" {
		t.Fatalf("image_url = %q", out.Answers[0].ImageURL)
	}
}

// A entrada original não é alterada (o slice de respostas é copiado).
func TestPollImagesNaoMexeNaEntrada(t *testing.T) {
	p, _, _ := newPollImagesEnv(t, map[string]string{}, true)
	in := pollInput(PollAnswerInput{Text: "a", ImageURL: "https://fora.do.ar/a.png"})
	p.Localize(context.Background(), in)
	if in.Answers[0].ImageURL != "https://fora.do.ar/a.png" {
		t.Fatalf("entrada mudou: %q", in.Answers[0].ImageURL)
	}
}

func TestBuildPollSoAceitaImagemDoServidor(t *testing.T) {
	local := PollImagePath + uuid.NewString()
	if _, err := buildPoll(pollInput(PollAnswerInput{Text: "a", ImageURL: local}, PollAnswerInput{Text: "b"}), time.Now()); err != nil {
		t.Fatalf("imagem do servidor recusada: %v", err)
	}
	for _, bad := range []string{"https://x.com/a.png", PollImagePath + "nao-e-uuid", "/api/profile-media/" + uuid.NewString(), "javascript:alert(1)"} {
		_, err := buildPoll(pollInput(PollAnswerInput{Text: "a", ImageURL: bad}, PollAnswerInput{Text: "b"}), time.Now())
		if !errors.Is(err, ErrPollImageInvalid) {
			t.Errorf("%q: err = %v, quero ErrPollImageInvalid", bad, err)
		}
	}
}

func TestPollImageIDsDasURLsGuardadas(t *testing.T) {
	a, b := uuid.NewString(), uuid.NewString()
	got := pollImageIDs([]string{PollImagePath + a, PollImagePath + b, "https://x.com/velha.png", PollImagePath + "lixo"})
	if len(got) != 2 || !got[a] || !got[b] {
		t.Fatalf("ids = %v", got)
	}
}

func TestPollImageRouteServeSemLogin(t *testing.T) {
	p, files, _ := newPollImagesEnv(t, map[string]string{}, true)
	id := uuid.NewString()
	if _, _, err := files.Save(id, strings.NewReader(pngHead), maxPollImageBytes); err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	PollImageRoutes(r.Group("/api"), p)
	for path, want := range map[string]int{
		"/api/poll-images/" + id:               http.StatusOK,
		"/api/poll-images/" + uuid.NewString(): http.StatusNotFound,
	} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != want {
			t.Errorf("%s: status %d, quero %d", path, w.Code, want)
		}
	}
}
