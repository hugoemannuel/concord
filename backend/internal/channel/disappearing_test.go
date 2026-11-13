package channel

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"

	"github.com/gin-gonic/gin"
)

func TestValidChannelDisappearing(t *testing.T) {
	for _, s := range []int{0, 86400, 604800, 7776000} {
		if !ValidChannelDisappearing(s) {
			t.Errorf("%d deveria valer", s)
		}
	}
	for _, s := range []int{-1, 1, 3600, 86401, 15552000} {
		if ValidChannelDisappearing(s) {
			t.Errorf("%d não deveria valer", s)
		}
	}
}

func TestValidateRecusaPrazoForaDaLista(t *testing.T) {
	bad, ok := 3600, 604800
	if err := (UpdateInput{Name: "geral", DisappearingSeconds: &bad}).validate(); !errors.Is(err, ErrInvalidDisappearing) {
		t.Fatalf("3600: %v", err)
	}
	if err := (UpdateInput{Name: "geral", DisappearingSeconds: &ok}).validate(); err != nil {
		t.Fatalf("604800: %v", err)
	}
}

func TestUpdatePrazoForaDaListaE400(t *testing.T) {
	store := newPermStore()
	rec := auditRequest(t, store, &audittest.Recorder{}, "mod", http.MethodPut, "/servers/s1/channels/geral", `{"name":"geral","disappearing_seconds":3600}`)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), `"code":"invalid_disappearing"`) {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	if store.channels["geral"].DisappearingSeconds != nil {
		t.Fatal("valor inválido foi gravado")
	}
}

func TestUpdatePrazoEVisualizacaoUnicaGravamEAuditam(t *testing.T) {
	store, log := newPermStore(), &audittest.Recorder{}
	rec := auditRequest(t, store, log, "mod", http.MethodPut, "/servers/s1/channels/geral", `{"name":"geral","disappearing_seconds":604800,"allow_view_once":false}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	var body Channel
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body.DisappearingSeconds == nil || *body.DisappearingSeconds != 604800 || body.AllowViewOnce {
		t.Fatalf("resposta %+v", body)
	}
	e, _ := log.Last()
	want := []audit.Change{
		{Field: "disappearing_seconds", Before: nil, After: 604800},
		{Field: "allow_view_once", Before: true, After: false},
	}
	if e.Action != audit.ChannelUpdate || !reflect.DeepEqual(e.Changes, want) {
		t.Fatalf("auditoria: %+v", e)
	}
}

// fakeNotices guarda os avisos postados (ou falha, se err estiver preenchido).
type fakeNotices struct {
	texts []string
	err   error
}

func (f *fakeNotices) PostChannelNotice(_ context.Context, _, _, content string) error {
	f.texts = append(f.texts, content)
	return f.err
}

func noticeRequest(t *testing.T, store *permStore, notices *fakeNotices, pub *permPublisher, body string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	svc := newService(store, pub)
	svc.SetNoticePoster(notices, func(context.Context, string) (string, error) { return "Ana", nil })
	ChannelRoutes(router.Group("/api"), ChannelHandler(svc, store), func(c *gin.Context) { c.Set("userID", "mod"); c.Next() })
	req := httptest.NewRequest(http.MethodPut, "/api/servers/s1/channels/geral", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
}

func TestTrocarPrazoPostaOAviso(t *testing.T) {
	store, notices := newPermStore(), &fakeNotices{}
	noticeRequest(t, store, notices, &permPublisher{}, `{"name":"geral","disappearing_seconds":604800}`)
	want := []string{"Ana ativou as mensagens temporárias. Novas mensagens vão sumir após 7 dias."}
	if !reflect.DeepEqual(notices.texts, want) {
		t.Fatalf("avisos = %q", notices.texts)
	}
}

func TestSalvarOMesmoPrazoNaoPosta(t *testing.T) {
	store, notices := newPermStore(), &fakeNotices{}
	week := 604800
	store.channels["geral"].DisappearingSeconds = &week
	noticeRequest(t, store, notices, &permPublisher{}, `{"name":"geral","disappearing_seconds":604800}`)
	noticeRequest(t, store, notices, &permPublisher{}, `{"name":"novo"}`)
	if len(notices.texts) != 0 {
		t.Fatalf("avisos = %q", notices.texts)
	}
	// Desligado e continuar desligado (0 e nil são o mesmo valor).
	off := newPermStore()
	noticeRequest(t, off, notices, &permPublisher{}, `{"name":"geral","disappearing_seconds":0}`)
	if len(notices.texts) != 0 {
		t.Fatalf("avisos = %q", notices.texts)
	}
}

func TestDesligarOPrazoPostaOAviso(t *testing.T) {
	store, notices := newPermStore(), &fakeNotices{}
	week := 604800
	store.channels["geral"].DisappearingSeconds = &week
	noticeRequest(t, store, notices, &permPublisher{}, `{"name":"geral","disappearing_seconds":0}`)
	want := []string{"Ana desativou as mensagens temporárias."}
	if !reflect.DeepEqual(notices.texts, want) {
		t.Fatalf("avisos = %q", notices.texts)
	}
}

func TestFalhaNoAvisoNaoDesfazAEdicao(t *testing.T) {
	store, pub := newPermStore(), &permPublisher{}
	notices := &fakeNotices{err: errors.New("banco fora")}
	noticeRequest(t, store, notices, pub, `{"name":"geral","disappearing_seconds":86400}`)
	got := store.channels["geral"].DisappearingSeconds
	if got == nil || *got != 86400 {
		t.Fatalf("gravado = %v", got)
	}
	if len(pub.updates) != 1 {
		t.Fatalf("channel:update = %d, want 1", len(pub.updates))
	}
	if len(notices.texts) != 1 {
		t.Fatalf("tentativas = %d", len(notices.texts))
	}
}
