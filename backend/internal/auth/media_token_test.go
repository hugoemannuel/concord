package auth

import (
	"testing"
	"time"
)

func TestMediaTokenRoundTrip(t *testing.T) {
	s := NewService(nil, []byte("segredo-de-teste"))
	now := time.Now()
	token, expiresAt, err := s.GenerateMediaToken("u1")
	if err != nil {
		t.Fatal(err)
	}
	userID, err := s.VerifyMediaToken(token)
	if err != nil || userID != "u1" {
		t.Fatalf("VerifyMediaToken = (%q, %v), want u1", userID, err)
	}
	if expiresAt.Before(now.Add(59*time.Minute)) || expiresAt.After(now.Add(61*time.Minute)) {
		t.Fatalf("expiresAt = %v, want ~1h a partir de %v", expiresAt, now)
	}
}

func TestMediaTokenRejectsAccessToken(t *testing.T) {
	s := NewService(nil, []byte("segredo-de-teste"))
	access, err := s.GenerateAccessToken("u1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.VerifyMediaToken(access); err == nil {
		t.Fatal("access token não pode abrir mídia")
	}
}

func TestAccessTokenCheckRejectsMediaToken(t *testing.T) {
	s := NewService(nil, []byte("segredo-de-teste"))
	token, _, err := s.GenerateMediaToken("u1")
	if err != nil {
		t.Fatal(err)
	}
	claims, err := s.ValidateToken(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Type != "media" {
		t.Fatalf("Type = %q, want media (o middleware só aceita access)", claims.Type)
	}
}
