package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestMiddlewareRejectsMediaTokenAsBearer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	s := NewService(nil, []byte("segredo-de-teste"))
	router := gin.New()
	router.GET("/x", AuthMiddleware(s), func(c *gin.Context) { c.Status(http.StatusOK) })

	mediaToken, _, err := s.GenerateMediaToken("u1")
	if err != nil {
		t.Fatal(err)
	}
	accessToken, err := s.GenerateAccessToken(context.Background(), "u1")
	if err != nil {
		t.Fatal(err)
	}
	for token, want := range map[string]int{mediaToken: http.StatusUnauthorized, accessToken: http.StatusOK} {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("status = %d, want %d", rec.Code, want)
		}
	}
}

// Rotas públicas que mostram mais a quem está logado (prévia do convite):
// token de acesso válido vira userID; sem token ou inválido, segue anônimo.
func TestOptionalAuthMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	s := NewService(nil, []byte("segredo-de-teste"))
	router := gin.New()
	router.GET("/x", OptionalAuthMiddleware(s), func(c *gin.Context) {
		c.String(http.StatusOK, c.GetString("userID"))
	})

	accessToken, err := s.GenerateAccessToken(context.Background(), "u1")
	if err != nil {
		t.Fatal(err)
	}
	mediaToken, _, err := s.GenerateMediaToken("u1")
	if err != nil {
		t.Fatal(err)
	}
	for header, want := range map[string]string{
		"":                      "",
		"Bearer " + accessToken: "u1",
		"Bearer " + mediaToken:  "",
		"Bearer lixo":           "",
		"Basic " + accessToken:  "",
	} {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK || rec.Body.String() != want {
			t.Errorf("%q: (%d, %q), want (200, %q)", header, rec.Code, rec.Body.String(), want)
		}
	}
}
