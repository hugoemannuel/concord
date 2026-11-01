package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func guestRouter(t *testing.T, mw func(*Service) gin.HandlerFunc) (*Service, *gin.Engine) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	s := NewService(nil, []byte("segredo-de-teste"))
	router := gin.New()
	router.GET("/x", mw(s), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"user": c.GetString("userID"), "guest": c.GetBool("guest")})
	})
	return s, router
}

func get(router *gin.Engine, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestGuestTokenExpiresWithTheAccess(t *testing.T) {
	s := NewService(nil, []byte("segredo-de-teste"))
	until := time.Now().Add(2 * time.Hour).Truncate(time.Second)
	token, err := s.GenerateGuestToken("g1", until)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := s.ValidateToken(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Type != TokenGuest || claims.UserID != "g1" || !claims.ExpiresAt.Time.Equal(until) {
		t.Fatalf("claims = %+v, want visitante g1 até %v", claims, until)
	}
	if _, err := s.GenerateGuestToken("g1", time.Now().Add(-time.Minute)); err == nil {
		t.Fatal("token de acesso já vencido não pode ser emitido")
	}
}

// O token de visitante não abre nenhuma rota comum: 403 (não 401, que faria o
// app tentar renovar e derrubar a sessão do visitante).
func TestAuthMiddlewareRefusesGuestToken(t *testing.T) {
	s, router := guestRouter(t, AuthMiddleware)
	token, err := s.GenerateGuestToken("g1", time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	rec := get(router, token)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
	var body struct{ Code string }
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body.Code != "guest_forbidden" {
		t.Fatalf("code = %q, want guest_forbidden", body.Code)
	}
}

func TestMemberOrGuestMiddleware(t *testing.T) {
	s, router := guestRouter(t, MemberOrGuestMiddleware)
	access, _ := s.GenerateAccessToken(context.Background(), "u1")
	guest, _ := s.GenerateGuestToken("g1", time.Now().Add(time.Hour))
	media, _, _ := s.GenerateMediaToken("u1")

	cases := []struct {
		name, token string
		status      int
		body        string
	}{
		{"conta", access, http.StatusOK, `{"guest":false,"user":"u1"}`},
		{"visitante", guest, http.StatusOK, `{"guest":true,"user":"g1"}`},
		{"token de mídia", media, http.StatusUnauthorized, ""},
		{"sem token", "", http.StatusUnauthorized, ""},
		{"lixo", "lixo", http.StatusUnauthorized, ""},
	}
	for _, tc := range cases {
		rec := get(router, tc.token)
		if rec.Code != tc.status {
			t.Errorf("%s: status = %d, want %d", tc.name, rec.Code, tc.status)
		}
		if tc.body != "" && rec.Body.String() != tc.body {
			t.Errorf("%s: corpo = %s, want %s", tc.name, rec.Body.String(), tc.body)
		}
	}
}
