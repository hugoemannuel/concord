package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// Sair de todos os dispositivos: o token de acesso de antes para de valer na
// hora (401 session_revoked); banco fora responde 503 (ninguém é deslogado
// por falha nossa); token sem "ver" (de antes da migration) vale como 0.
func TestAuthMiddlewareConfereVersaoDaSessao(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := &fakeVersions{versions: map[string]int{"u1": 0}}
	s := NewService(nil, []byte("segredo-de-teste"))
	s.SetSessionVersions(NewVersionCache(store, time.Minute))
	router := gin.New()
	router.GET("/x", AuthMiddleware(s), func(c *gin.Context) { c.Status(http.StatusOK) })
	get := func(token string) int {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec.Code
	}

	old, err := s.GenerateAccessToken(context.Background(), "u1")
	if err != nil {
		t.Fatal(err)
	}
	if code := get(old); code != http.StatusOK {
		t.Fatalf("token da versão atual: %d", code)
	}

	store.versions["u1"] = 1
	s.ForgetSession("u1")
	if code := get(old); code != http.StatusUnauthorized {
		t.Fatalf("token de antes da revogação: %d, quer 401", code)
	}
	fresh, _ := s.GenerateAccessToken(context.Background(), "u1")
	if code := get(fresh); code != http.StatusOK {
		t.Fatalf("token novo: %d", code)
	}

	store.err = errors.New("banco caiu")
	s.ForgetSession("u1")
	if code := get(fresh); code != http.StatusServiceUnavailable {
		t.Fatalf("banco fora: %d, quer 503", code)
	}
}
