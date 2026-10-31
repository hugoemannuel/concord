package websocket

import (
	"testing"
	"time"

	"gin-quickstart/backend/internal/auth"
)

// O WebSocket aceita a conta e o visitante sem conta (que só consegue entrar
// nas salas da própria call e do próprio usuário: o validador confere).
func TestWSUserAcceptsAccountAndGuest(t *testing.T) {
	s := auth.NewService(nil, []byte("segredo-de-teste"))
	h := &Handler{authService: s}
	access, _ := s.GenerateAccessToken("u1")
	guest, _ := s.GenerateGuestToken("g1", time.Now().Add(time.Hour))
	media, _, _ := s.GenerateMediaToken("u1")

	cases := []struct {
		name, token, want string
		ok                bool
	}{
		{"conta", access, "u1", true},
		{"visitante", guest, "g1", true},
		{"token de mídia", media, "", false},
		{"lixo", "lixo", "", false},
	}
	for _, tc := range cases {
		got, ok := h.wsUser(tc.token)
		if got != tc.want || ok != tc.ok {
			t.Errorf("%s: (%q, %v), want (%q, %v)", tc.name, got, ok, tc.want, tc.ok)
		}
	}
}
