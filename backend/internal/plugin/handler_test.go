package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

type enabledStore struct {
	fakeStore
	on bool
}

func (e *enabledStore) SetEnabled(_ context.Context, _, _, _ string, on bool) error {
	e.on = on
	return nil
}

func newRouter(st store, perr error) *gin.Engine {
	return newRouterAs(st, perr, "u1")
}

func newRouterAs(st store, perr error, userID string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	svc := NewService(st, fakePerms{err: perr}, &fakePub{}, []string{"tech"})
	r := gin.New()
	pass := func(c *gin.Context) { c.Set("userID", userID); c.Next() }
	Routes(r.Group("/"), NewHandler(svc), pass, func(c *gin.Context) { c.Next() })
	return r
}

func do(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func TestHandlerCreateInvalidURL(t *testing.T) {
	w := do(newRouter(&fakeStore{}, nil), "POST", "/plugins", `{"name":"Placar","description":"Jogos","panel_url":"http://x.com"}`)
	wantError(t, w, 400, "invalid_url")
}

func TestHandlerCreateValid(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusPending, PanelURL: "https://example.com/"}}
	w := do(newRouter(st, nil), "POST", "/plugins", `{"name":"Placar ao vivo","description":"Jogos do Galo","panel_url":"https://example.com/"}`)
	if w.Code != 201 || !st.created || st.draft.PanelURL != "https://example.com/" ||
		!strings.Contains(w.Body.String(), `"panel_url":"https://example.com/"`) ||
		!strings.Contains(w.Body.String(), `"status":"pending"`) {
		t.Fatalf("%d %s draft=%+v", w.Code, w.Body, st.draft)
	}
}

func TestHandlerInvalidPluginID(t *testing.T) {
	w := do(newRouter(&fakeStore{}, nil), "PUT", "/servers/11111111-1111-4111-8111-111111111111/plugins/nao-e-uuid", "")
	wantError(t, w, 404, "not_found")
}

func TestHandlerInstallMissingPermission(t *testing.T) {
	w := do(newRouter(&fakeStore{}, permission.ErrMissingPermission), "PUT", "/servers/11111111-1111-4111-8111-111111111111/plugins/22222222-2222-4222-8222-222222222222", "")
	wantError(t, w, 403, "missing_permission")
}

func TestHandlerListServerEmptyIsArray(t *testing.T) {
	w := do(newRouter(&fakeStore{}, nil), "GET", "/servers/11111111-1111-4111-8111-111111111111/plugins", "")
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `[]` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestHandlerToggleMe(t *testing.T) {
	st := &enabledStore{}
	w := do(newRouter(st, nil), "PUT", "/servers/11111111-1111-4111-8111-111111111111/plugins/22222222-2222-4222-8222-222222222222/me", `{"enabled":true}`)
	if w.Code != http.StatusNoContent || !st.on {
		t.Fatalf("%d on=%v", w.Code, st.on)
	}
}

// wantError confere o formato de erro do repo: {"error": mensagem, "code": código}.
func wantError(t *testing.T, w *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	var body struct {
		Error string `json:"error"`
		Code  string `json:"code"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("corpo não é JSON: %s", w.Body)
	}
	if w.Code != status || body.Code != code || body.Error == "" {
		t.Fatalf("esperava %d %q, veio %d %s", status, code, w.Code, w.Body)
	}
}

type failingStore struct{ fakeStore }

func (f *failingStore) ListServer(context.Context, string, string) ([]ServerPlugin, error) {
	return nil, errors.New("db fora")
}

func TestHandlerInternalErrorHidesDetail(t *testing.T) {
	w := do(newRouter(&failingStore{}, nil), "GET", "/servers/11111111-1111-4111-8111-111111111111/plugins", "")
	wantError(t, w, 500, "internal")
	if strings.Contains(w.Body.String(), "db fora") {
		t.Fatalf("vazou o erro interno: %s", w.Body)
	}
}

func TestHandlerUninstallNotFound(t *testing.T) {
	w := do(newRouter(&fakeStore{getErr: ErrNotFound}, nil), "DELETE", "/servers/11111111-1111-4111-8111-111111111111/plugins/22222222-2222-4222-8222-222222222222", "")
	wantError(t, w, 404, "not_found")
}

func TestHandlerWithdrawWithoutNote(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusApproved}}
	w := do(newRouterAs(st, nil, "tech"), "PATCH", "/plugins/22222222-2222-4222-8222-222222222222/review", `{"status":"rejected"}`)
	wantError(t, w, 400, "note_required")
}

func TestHandlerReviewNoteTooLong(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusPending}}
	body := `{"status":"rejected","note":"` + strings.Repeat("a", 501) + `"}`
	w := do(newRouterAs(st, nil, "tech"), "PATCH", "/plugins/22222222-2222-4222-8222-222222222222/review", body)
	wantError(t, w, 400, "invalid_note")
}

func TestHandlerCreateWithIcon(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusPending, Icon: "bola"}}
	w := do(newRouter(st, nil), "POST", "/plugins", `{"name":"Placar ao vivo","description":"Jogos do Galo","panel_url":"https://example.com/","icon":"bola"}`)
	if w.Code != 201 || st.draft.Icon != "bola" || !strings.Contains(w.Body.String(), `"icon":"bola"`) {
		t.Fatalf("%d %s draft=%+v", w.Code, w.Body, st.draft)
	}
}

func TestHandlerCreateInvalidIcon(t *testing.T) {
	w := do(newRouter(&fakeStore{}, nil), "POST", "/plugins", `{"name":"Placar","description":"Jogos","panel_url":"https://example.com/","icon":"xyz"}`)
	wantError(t, w, 400, "invalid_icon")
}
