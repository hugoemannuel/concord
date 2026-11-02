package plugin

import (
	"context"
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
	gin.SetMode(gin.TestMode)
	svc := NewService(st, fakePerms{err: perr}, &fakePub{}, []string{"tech"})
	r := gin.New()
	pass := func(c *gin.Context) { c.Set("userID", "u1"); c.Next() }
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
	if w.Code != 400 || strings.TrimSpace(w.Body.String()) != `{"error":"invalid_url"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
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
	if w.Code != 404 || strings.TrimSpace(w.Body.String()) != `{"error":"not_found"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestHandlerInstallMissingPermission(t *testing.T) {
	w := do(newRouter(&fakeStore{}, permission.ErrMissingPermission), "PUT", "/servers/11111111-1111-4111-8111-111111111111/plugins/22222222-2222-4222-8222-222222222222", "")
	if w.Code != 403 || strings.TrimSpace(w.Body.String()) != `{"error":"missing_permission"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
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
