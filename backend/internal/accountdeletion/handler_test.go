package accountdeletion

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type fakeConfirmer struct {
	ok       bool
	password string
}

func (f *fakeConfirmer) ConfirmPassword(c *gin.Context, password string) (string, bool) {
	f.password = password
	if !f.ok {
		c.JSON(http.StatusForbidden, gin.H{"code": "wrong_password"})
		return "", false
	}
	return "u1", true
}

type fakeDeleter struct {
	err    error
	called string
}

func (f *fakeDeleter) Delete(_ context.Context, userID string) error {
	f.called = userID
	return f.err
}

func postDelete(t *testing.T, h *Handler, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/users/me/delete", h.DeleteMe)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/users/me/delete", strings.NewReader(body)))
	return w
}

func TestDeleteMe(t *testing.T) {
	owns := &OwnsServersError{Servers: []OwnedServer{{ID: "s1", Name: "Amigos"}}}
	for _, tc := range []struct {
		name       string
		body       string
		passwordOK bool
		deleteErr  error
		status     int
		code       string
		deletes    bool
	}{
		{"sem confirmar", `{"password":"x"}`, true, nil, http.StatusBadRequest, "confirm_required", false},
		{"senha errada", `{"password":"x","confirm":true}`, false, nil, http.StatusForbidden, "wrong_password", false},
		{"dono de servidor com membros", `{"password":"x","confirm":true}`, true, owns, http.StatusConflict, "owns_servers", true},
		{"conta sumiu", `{"password":"x","confirm":true}`, true, ErrNotFound, http.StatusNotFound, "", true},
		{"exclui", `{"password":"x","confirm":true}`, true, nil, http.StatusNoContent, "", true},
		{"corpo inválido", `{`, true, nil, http.StatusBadRequest, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			deleter := &fakeDeleter{err: tc.deleteErr}
			w := postDelete(t, NewHandler(&fakeConfirmer{ok: tc.passwordOK}, deleter), tc.body)

			if w.Code != tc.status {
				t.Fatalf("status = %d, quer %d (%s)", w.Code, tc.status, w.Body)
			}
			if (deleter.called == "u1") != tc.deletes {
				t.Errorf("Delete chamado = %q, quer chamado = %v", deleter.called, tc.deletes)
			}
			if tc.code == "" {
				return
			}
			var body struct {
				Code    string        `json:"code"`
				Servers []OwnedServer `json:"servers"`
			}
			_ = json.Unmarshal(w.Body.Bytes(), &body)
			if body.Code != tc.code {
				t.Errorf("code = %q, quer %q", body.Code, tc.code)
			}
			if tc.code == "owns_servers" && (len(body.Servers) != 1 || body.Servers[0].Name != "Amigos") {
				t.Errorf("servers = %+v", body.Servers)
			}
		})
	}
}
