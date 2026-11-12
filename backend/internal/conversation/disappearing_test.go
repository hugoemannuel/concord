package conversation

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func intPtr(n int) *int { return &n }

func TestValidDisappearing(t *testing.T) {
	for _, ok := range []*int{nil, intPtr(86400), intPtr(604800), intPtr(7776000)} {
		if err := ValidDisappearing(ok); err != nil {
			t.Errorf("%v deveria ser válido: %v", ok, err)
		}
	}
	for _, bad := range []int{0, 3600, -1} {
		if err := ValidDisappearing(&bad); !errors.Is(err, ErrInvalidDisappearing) {
			t.Errorf("%d: esperava ErrInvalidDisappearing, veio %v", bad, err)
		}
	}
}

func TestDisappearingNotice(t *testing.T) {
	if got, want := DisappearingNotice("Ana", intPtr(604800)), "Ana ativou as mensagens temporárias. Novas mensagens vão sumir após 7 dias."; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	if got := DisappearingNotice("Ana", intPtr(86400)); !strings.HasSuffix(got, "após 24 horas.") {
		t.Errorf("24h: %q", got)
	}
	if got := DisappearingNotice("Ana", intPtr(7776000)); !strings.HasSuffix(got, "após 90 dias.") {
		t.Errorf("90d: %q", got)
	}
	if got, want := DisappearingNotice("Ana", nil), "Ana desativou as mensagens temporárias."; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

type fakeDisappearingStore struct{ saved []*int }

func (f *fakeDisappearingStore) SetDisappearing(_ context.Context, _ string, s *int) error {
	f.saved = append(f.saved, s)
	return nil
}

type fakeNotices struct{ kinds, contents []string }

func (f *fakeNotices) PostConversationNotice(_ context.Context, _, _, content, kind string) error {
	f.kinds = append(f.kinds, kind)
	f.contents = append(f.contents, content)
	return nil
}

func newDisappearingFixture(member bool) (*DisappearingService, *fakeDisappearingStore, *fakeNotices, *[]string) {
	store, notices, events := &fakeDisappearingStore{}, &fakeNotices{}, &[]string{}
	return &DisappearingService{
		repo:          store,
		isParticipant: func(context.Context, string, string) (bool, error) { return member, nil },
		actorName:     func(context.Context, string) (string, error) { return "Ana", nil },
		notices:       notices,
		publish:       func(eventType, _ string) { *events = append(*events, eventType) },
	}, store, notices, events
}

func TestSetDisappearingNaoParticipante(t *testing.T) {
	svc, store, notices, events := newDisappearingFixture(false)
	err := svc.Set(context.Background(), "u1", "c1", intPtr(86400))
	if !errors.Is(err, ErrNotParticipant) {
		t.Fatalf("esperava ErrNotParticipant, veio %v", err)
	}
	if len(store.saved) != 0 || len(notices.kinds) != 0 || len(*events) != 0 {
		t.Fatal("não deveria gravar, avisar nem publicar")
	}
}

func TestSetDisappearingPrazoInvalido(t *testing.T) {
	svc, store, _, _ := newDisappearingFixture(true)
	if err := svc.Set(context.Background(), "u1", "c1", intPtr(3600)); !errors.Is(err, ErrInvalidDisappearing) {
		t.Fatalf("veio %v", err)
	}
	if len(store.saved) != 0 {
		t.Fatal("não deveria gravar")
	}
}

func TestSetDisappearingGravaAvisaEPublica(t *testing.T) {
	svc, store, notices, events := newDisappearingFixture(true)
	if err := svc.Set(context.Background(), "u1", "c1", intPtr(86400)); err != nil {
		t.Fatal(err)
	}
	if len(store.saved) != 1 || *store.saved[0] != 86400 {
		t.Fatalf("gravou %v", store.saved)
	}
	if len(notices.kinds) != 1 || notices.kinds[0] != "disappearing" {
		t.Fatalf("avisos %v", notices.kinds)
	}
	if len(*events) != 1 || (*events)[0] != EventUpdate {
		t.Fatalf("eventos %v", *events)
	}
}

func putDisappearing(t *testing.T, body string) int {
	t.Helper()
	gin.SetMode(gin.TestMode)
	svc, _, _, _ := newDisappearingFixture(true)
	h := &Handler{disappearing: svc}
	r := gin.New()
	r.PUT("/conversations/:id/disappearing", func(c *gin.Context) { c.Set("userID", "u1") }, h.SetDisappearing)
	req := httptest.NewRequest(http.MethodPut, "/conversations/c1/disappearing", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func TestSetDisappearingHandler(t *testing.T) {
	if code := putDisappearing(t, `{"seconds":3600}`); code != http.StatusBadRequest {
		t.Errorf("prazo inválido: %d", code)
	}
	if code := putDisappearing(t, `{"seconds":604800}`); code != http.StatusNoContent {
		t.Errorf("sucesso: %d", code)
	}
	if code := putDisappearing(t, `{"seconds":null}`); code != http.StatusNoContent {
		t.Errorf("desligar: %d", code)
	}
}

// respondError traduz cada erro de domínio no status certo.
func TestRespondErrorStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	casos := map[error]int{
		ErrNotFound:        http.StatusNotFound,
		ErrNotParticipant:  http.StatusForbidden,
		ErrGroupFull:       http.StatusBadRequest,
		errors.New("boom"): http.StatusInternalServerError,
	}
	for err, want := range casos {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		respondError(c, err)
		if w.Code != want {
			t.Errorf("%v: status %d, want %d", err, w.Code, want)
		}
	}
}

type failingNotices struct{}

func (failingNotices) PostConversationNotice(context.Context, string, string, string, string) error {
	return errors.New("falha ao postar")
}

// Se o aviso falhar, o modo já gravado ainda é publicado aos membros.
func TestSetDisappearingAvisoFalhaAindaPublica(t *testing.T) {
	svc, store, _, events := newDisappearingFixture(true)
	svc.notices = failingNotices{}
	if err := svc.Set(context.Background(), "u1", "c1", intPtr(86400)); err == nil {
		t.Fatal("esperava erro do aviso")
	}
	if len(store.saved) != 1 || len(*events) != 1 || (*events)[0] != EventUpdate {
		t.Fatalf("gravou %v, eventos %v", store.saved, *events)
	}
}

// Se o nome do autor não resolve, nada é gravado.
func TestSetDisappearingNomeFalhaNaoGrava(t *testing.T) {
	svc, store, _, events := newDisappearingFixture(true)
	svc.actorName = func(context.Context, string) (string, error) { return "", errors.New("sem usuário") }
	if err := svc.Set(context.Background(), "u1", "c1", intPtr(86400)); err == nil {
		t.Fatal("esperava erro")
	}
	if len(store.saved) != 0 || len(*events) != 0 {
		t.Fatal("não deveria gravar nem publicar")
	}
}
