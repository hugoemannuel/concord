package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestViewOnceTokenRoundTrip(t *testing.T) {
	s := NewService(nil, []byte("segredo-de-teste"))
	now := time.Now()
	token, expiresAt, err := s.GenerateViewOnceToken("u1", "a1")
	if err != nil {
		t.Fatal(err)
	}
	userID, err := s.VerifyViewOnceToken(token, "a1")
	if err != nil || userID != "u1" {
		t.Fatalf("VerifyViewOnceToken = (%q, %v), want u1", userID, err)
	}
	if expiresAt.Before(now.Add(4*time.Minute)) || expiresAt.After(now.Add(6*time.Minute)) {
		t.Fatalf("expiresAt = %v, want ~5min a partir de %v", expiresAt, now)
	}
}

func TestViewOnceTokenRejectsOtherAttachment(t *testing.T) {
	s := NewService(nil, []byte("segredo-de-teste"))
	token, _, err := s.GenerateViewOnceToken("u1", "a1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.VerifyViewOnceToken(token, "a2"); err == nil {
		t.Fatal("token do anexo a1 não pode abrir o anexo a2")
	}
	if _, err := s.VerifyViewOnceToken(token, ""); err == nil {
		t.Fatal("anexo vazio não pode verificar")
	}
}

func TestViewOnceTokenRejectsMediaToken(t *testing.T) {
	s := NewService(nil, []byte("segredo-de-teste"))
	media, _, err := s.GenerateMediaToken("u1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.VerifyViewOnceToken(media, "a1"); err == nil {
		t.Fatal("token media não abre visualização única")
	}
	once, _, _ := s.GenerateViewOnceToken("u1", "a1")
	if _, err := s.VerifyMediaToken(once); err == nil {
		t.Fatal("token view_once não abre mídia comum")
	}
}

func TestViewOnceTokenRejectsExpired(t *testing.T) {
	s := NewService(nil, []byte("segredo-de-teste"))
	claims := Claims{
		UserID:       "u1",
		Type:         "view_once",
		AttachmentID: "a1",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-6 * time.Minute)),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.VerifyViewOnceToken(signed, "a1"); err == nil {
		t.Fatal("token expirado não pode verificar")
	}
}

func TestMiddlewaresRejectViewOnceToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	s := NewService(nil, []byte("segredo-de-teste"))
	router := gin.New()
	router.GET("/a", AuthMiddleware(s), func(c *gin.Context) { c.Status(http.StatusOK) })
	router.GET("/g", MemberOrGuestMiddleware(s), func(c *gin.Context) { c.Status(http.StatusOK) })
	token, _, err := s.GenerateViewOnceToken("u1", "a1")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/a", "/g"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s: status = %d, want 401", path, rec.Code)
		}
	}
}
