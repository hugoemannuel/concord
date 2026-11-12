package message

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type fakeViewOnceTokens struct{ err error }

func (f fakeViewOnceTokens) GenerateViewOnceToken(userID, attachmentID string) (string, time.Time, error) {
	if f.err != nil {
		return "", time.Time{}, f.err
	}
	return "vo:" + attachmentID + ":" + userID, time.Now().Add(5 * time.Minute), nil
}

type lockedPublisher struct {
	pinTestPublisher
	mu      sync.Mutex
	updates []UpdateEvent
}

func (p *lockedPublisher) PublishMessageUpdate(e UpdateEvent) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.updates = append(p.updates, e)
}

// enviarViewOnce: a ana manda uma foto de visualização única na conversa,
// que só os recipients podem abrir. Devolve a mensagem e o anexo.
func enviarViewOnce(t *testing.T, s *searchDB, repo *Repository, recipients ...string) (string, string) {
	t.Helper()
	ana := s.users["ana"]
	att := anexoPendente(t, s, repo, ana, "image")
	if err := repo.MarkViewOnce(s.ctx, att, ana, s.convID, recipients); err != nil {
		t.Fatal(err)
	}
	conv := s.convID
	msg := &Message{ID: uuid.NewString(), AuthorID: ana, ConversationID: &conv}
	if err := repo.CreateWithAttachments(s.ctx, msg, []string{att}); err != nil {
		t.Fatal(err)
	}
	return msg.ID, att
}

type openEnv struct {
	svc *ViewOnceService
	pub *lockedPublisher
}

func newOpenEnv(s *searchDB, repo *Repository, access RoomAccess) *openEnv {
	env := &openEnv{pub: &lockedPublisher{}}
	ids := []string{s.users["ana"], s.users["bia"], s.users["caio"]}
	env.svc = NewViewOnceService(repo, fakeViewOnceRooms{ids: ids})
	env.svc.SetOpen(ViewOnceOpenDeps{Repo: repo, Access: access, Tokens: fakeViewOnceTokens{}, Publisher: env.pub})
	return env
}

func carregar(t *testing.T, s *searchDB, repo *Repository, id string) Message {
	t.Helper()
	m, err := repo.FindByID(s.ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	page := []Message{*m}
	if err := repo.AttachAttachments(s.ctx, page); err != nil {
		t.Fatal(err)
	}
	return page[0]
}

// Ruling R10: a mensagem diz quem podia abrir, para quem entrou no grupo
// depois não ver um botão que nunca funciona.
func TestListaTrazQuemPodiaAbrir(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	bia, caio := s.users["bia"], s.users["caio"]
	msgID, _ := enviarViewOnce(t, s, repo, bia, caio)

	vo := carregar(t, s, repo, msgID).ViewOnce
	if vo == nil || vo.RecipientCount != 2 || len(vo.RecipientIDs) != 2 {
		t.Fatalf("view_once = %+v", vo)
	}
	got := map[string]bool{vo.RecipientIDs[0]: true, vo.RecipientIDs[1]: true}
	if !got[bia] || !got[caio] {
		t.Fatalf("recipient_ids = %v", vo.RecipientIDs)
	}
	raw, _ := json.Marshal(vo)
	if !strings.Contains(string(raw), `"recipient_ids":[`) {
		t.Fatalf("json = %s", raw)
	}
}

// Foco de revisão 4: app antigo não acha o anexo em attachments.
func TestListaTiraViewOnceDeAttachments(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	msgID, att := enviarViewOnce(t, s, repo, s.users["caio"])

	got := carregar(t, s, repo, msgID)
	if len(got.Attachments) != 0 {
		t.Fatalf("attachments = %+v", got.Attachments)
	}
	vo := got.ViewOnce
	if vo == nil || vo.ID != att || vo.Kind != "image" || vo.Gone || vo.RecipientCount != 1 || len(vo.ViewerIDs) != 0 {
		t.Fatalf("view_once = %+v", vo)
	}
	raw, _ := json.Marshal(got)
	if strings.Contains(string(raw), `"attachments"`) || !strings.Contains(string(raw), `"viewer_ids":[]`) {
		t.Fatalf("json = %s", raw)
	}
}

func TestOpenAutorDa403(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{})
	if _, _, err := env.svc.Open(s.ctx, att, s.users["ana"]); !errors.Is(err, ErrViewOnceForbidden) {
		t.Fatalf("err = %v", err)
	}
}

// Foco de revisão 5: quem não estava na conversa no envio não abre, mesmo lendo a sala.
func TestOpenQuemEntrouDepoisDa403(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{})
	if _, _, err := env.svc.Open(s.ctx, att, s.users["bia"]); !errors.Is(err, ErrViewOnceForbidden) {
		t.Fatalf("err = %v", err)
	}
	var n int
	s.db.QueryRow(s.ctx, `SELECT count(*) FROM attachment_views WHERE attachment_id = $1`, att).Scan(&n)
	if n != 0 {
		t.Fatalf("visualizações = %d", n)
	}
}

func TestOpenSemAcessoASalaNaoAbre(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{readErr: ErrNoRoomAccess})
	if _, _, err := env.svc.Open(s.ctx, att, s.users["caio"]); !errors.Is(err, ErrNoRoomAccess) {
		t.Fatalf("err = %v", err)
	}
}

func TestOpenAnexoComumOuPendenteNaoAcha(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	env := newOpenEnv(s, repo, fakeAccess{})
	comum := anexoPendente(t, s, repo, s.users["ana"], "image")
	for _, id := range []string{comum, uuid.NewString(), "nao-e-uuid"} {
		if _, _, err := env.svc.Open(s.ctx, id, s.users["caio"]); !errors.Is(err, ErrAttachmentNotFound) {
			t.Errorf("%s: err = %v", id, err)
		}
	}
}

func TestOpenSegundaVezDa410(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["bia"], s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{})
	token, exp, err := env.svc.Open(s.ctx, att, s.users["caio"])
	if err != nil || token == "" || exp.IsZero() {
		t.Fatalf("token=%q exp=%v err=%v", token, exp, err)
	}
	if _, _, err := env.svc.Open(s.ctx, att, s.users["caio"]); !errors.Is(err, ErrViewOnceGone) {
		t.Fatalf("err = %v", err)
	}
}

// Erro ao gerar o token não gasta a visualização.
func TestOpenFalhaNoTokenNaoGastaVisualizacao(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{})
	env.svc.open.Tokens = fakeViewOnceTokens{err: errors.New("jwt")}
	if _, _, err := env.svc.Open(s.ctx, att, s.users["caio"]); err == nil {
		t.Fatal("esperava erro")
	}
	env.svc.open.Tokens = fakeViewOnceTokens{}
	if _, _, err := env.svc.Open(s.ctx, att, s.users["caio"]); err != nil {
		t.Fatalf("err = %v", err)
	}
}

// Foco de revisão 2: duas aberturas ao mesmo tempo, só uma ganha o token.
func TestOpenConcorrenteSoUmGanha(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{})

	var wg sync.WaitGroup
	errs := make([]error, 2)
	tokens := make([]string, 2)
	for i := range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tokens[i], _, errs[i] = env.svc.Open(context.Background(), att, s.users["caio"])
		}()
	}
	wg.Wait()
	ok, gone := 0, 0
	for i, err := range errs {
		switch {
		case err == nil && tokens[i] != "":
			ok++
		case errors.Is(err, ErrViewOnceGone):
			gone++
		}
	}
	if ok != 1 || gone != 1 {
		t.Fatalf("tokens=%v errs=%v", tokens, errs)
	}
	if len(env.pub.updates) != 1 {
		t.Fatalf("updates = %d", len(env.pub.updates))
	}
}

// D8: abrir não apaga nada; o token segura o arquivo pelos 5 min (a limpeza
// periódica apaga depois). Num 1:1, o único destinatário abre e carrega.
func TestOpenUnicoDestinatarioArquivoContinua(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	caio := s.users["caio"]
	msgID, att := enviarViewOnce(t, s, repo, caio)
	env := newOpenEnv(s, repo, fakeAccess{})

	token, _, err := env.svc.Open(s.ctx, att, caio)
	if err != nil {
		t.Fatal(err)
	}
	if len(env.pub.updates) != 1 {
		t.Fatalf("updates = %d", len(env.pub.updates))
	}
	last := env.pub.updates[0]
	vo := last.Message.ViewOnce
	if last.Message.ID != msgID || last.ConversationID == nil || *last.ConversationID != s.convID || len(last.UserIDs) != 3 {
		t.Fatalf("update = %+v", last)
	}
	if vo == nil || vo.Gone || len(vo.ViewerIDs) != 1 || vo.ViewerIDs[0] != caio || vo.RecipientCount != 1 {
		t.Fatalf("view_once = %+v", vo)
	}

	store, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.Save(att, bytes.NewReader(pngBytes(64)), 1024); err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	h := NewAttachmentHandler(repo, store, fakeSpace{ok: true}, fakeAccess{}, openTokens{})
	AttachmentRoutes(router.Group("/api"), h, func(c *gin.Context) {})
	for rangeHeader, want := range map[string]int{"": http.StatusOK, "bytes=0-3": http.StatusPartialContent} {
		req := httptest.NewRequest(http.MethodGet, "/api/media/"+att+"?token="+token, nil)
		if rangeHeader != "" {
			req.Header.Set("Range", rangeHeader)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("Range %q: status = %d, want %d", rangeHeader, rec.Code, want)
		}
	}
	if files, _ := store.List(); len(files) != 1 {
		t.Fatalf("arquivo sumiu do disco: %v", files)
	}
}

// openTokens confere o token do fakeViewOnceTokens ("vo:<anexo>:<usuário>").
type openTokens struct{ fakeTokens }

func (openTokens) VerifyViewOnceToken(token, attachmentID string) (string, error) {
	prefix := "vo:" + attachmentID + ":"
	if !strings.HasPrefix(token, prefix) {
		return "", errors.New("invalid token")
	}
	return strings.TrimPrefix(token, prefix), nil
}

// Já apagada (14 dias): não dá mais para gravar visualização.
func TestGrantViewDepoisDeGoneNaoGrava(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	caio := s.users["caio"]
	_, att := enviarViewOnce(t, s, repo, caio)
	if _, err := s.db.Exec(s.ctx, `UPDATE message_attachments SET view_once_gone_at = now() WHERE id = $1`, att); err != nil {
		t.Fatal(err)
	}
	if ok, err := repo.GrantView(s.ctx, att, caio); err != nil || ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	a, err := repo.FindAttachment(s.ctx, att)
	if err != nil || !a.ViewOnce || !a.ViewOnceGone {
		t.Fatalf("a=%+v err=%v", a, err)
	}
	env := newOpenEnv(s, repo, fakeAccess{})
	if _, _, err := env.svc.Open(s.ctx, att, caio); !errors.Is(err, ErrViewOnceGone) {
		t.Fatalf("err = %v", err)
	}
}
