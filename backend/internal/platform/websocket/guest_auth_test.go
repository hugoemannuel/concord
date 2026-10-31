package websocket

import (
	"context"
	"testing"
	"time"

	"gin-quickstart/backend/internal/auth"
)

// O WebSocket aceita a conta e o visitante sem conta (que só consegue entrar
// nas salas da própria call e do próprio usuário: o validador confere).
func TestWSUserAcceptsAccountAndGuest(t *testing.T) {
	s := auth.NewService(nil, []byte("segredo-de-teste"))
	h := &Handler{authService: s}
	access, _ := s.GenerateAccessToken(context.Background(), "u1")
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
		got, ok := h.wsUser(context.Background(), tc.token)
		if got != tc.want || ok != tc.ok {
			t.Errorf("%s: (%q, %v), want (%q, %v)", tc.name, got, ok, tc.want, tc.ok)
		}
	}
}

type versionsByUser map[string]int

func (v versionsByUser) TokenVersion(_ context.Context, userID string) (int, error) {
	ver, ok := v[userID]
	if !ok {
		return 0, auth.ErrSessionRevoked
	}
	return ver, nil
}

// Depois de "sair de todos os dispositivos" (ou excluir a conta) o token
// antigo não reconecta o WebSocket.
func TestWSUserRecusaSessaoRevogada(t *testing.T) {
	versions := versionsByUser{"u1": 0}
	s := auth.NewService(nil, []byte("segredo-de-teste"))
	s.SetSessionVersions(auth.NewVersionCache(versions, time.Minute))
	h := &Handler{authService: s}
	token, _ := s.GenerateAccessToken(context.Background(), "u1")

	versions["u1"] = 1
	s.ForgetSession("u1")
	if _, ok := h.wsUser(context.Background(), token); ok {
		t.Fatal("token de versão antiga conectou")
	}
	delete(versions, "u1")
	s.ForgetSession("u1")
	if _, ok := h.wsUser(context.Background(), token); ok {
		t.Fatal("conta excluída conectou")
	}
}
