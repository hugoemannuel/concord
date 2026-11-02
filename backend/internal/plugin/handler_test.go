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
	w := do(newRouter(&fakeStore{}, nil), "POST", "/plugins", `{"name":"a","description":"b","panel_url":"http://x"}`)
	if w.Code != 400 || strings.TrimSpace(w.Body.String()) != `{"error":"invalid_url"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestHandlerInstallMissingPermission(t *testing.T) {
	w := do(newRouter(&fakeStore{}, permission.ErrMissingPermission), "PUT", "/servers/s1/plugins/p1", "")
	if w.Code != 403 || strings.TrimSpace(w.Body.String()) != `{"error":"missing_permission"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestHandlerListServerEmptyIsArray(t *testing.T) {
	w := do(newRouter(&fakeStore{}, nil), "GET", "/servers/s1/plugins", "")
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `[]` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestHandlerToggleMe(t *testing.T) {
	st := &enabledStore{}
	w := do(newRouter(st, nil), "PUT", "/servers/s1/plugins/p1/me", `{"enabled":true}`)
	if w.Code != http.StatusNoContent || !st.on {
		t.Fatalf("%d on=%v", w.Code, st.on)
	}
}
