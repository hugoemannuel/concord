package authctx

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func contexto(t *testing.T) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	return c, w
}

func TestUserIDDevolveOIDGuardadoPeloMiddleware(t *testing.T) {
	c, w := contexto(t)
	c.Set(UserIDKey, "u1")
	id, ok := UserID(c)
	if !ok || id != "u1" {
		t.Fatalf("UserID = %q, %v; quer u1, true", id, ok)
	}
	if w.Body.Len() != 0 {
		t.Fatalf("não devia responder nada: %q", w.Body.String())
	}
}

func TestUserIDSemUsuarioResponde401(t *testing.T) {
	casos := map[string]any{"ausente": nil, "vazio": "", "tipo errado": 42}
	for nome, valor := range casos {
		t.Run(nome, func(t *testing.T) {
			c, w := contexto(t)
			if valor != nil {
				c.Set(UserIDKey, valor)
			}
			if _, ok := UserID(c); ok {
				t.Fatal("ok = true; quer false")
			}
			if w.Code != http.StatusUnauthorized || w.Body.String() != `{"error":"unauthorized"}` {
				t.Fatalf("resposta = %d %q", w.Code, w.Body.String())
			}
		})
	}
}
