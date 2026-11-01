package websocket

import (
	"context"

	"gin-quickstart/backend/internal/auth"
)

// ConnectAuth decide quem abre o WebSocket. Fica fora do Handler (que cuida
// das salas e do hub) para a regra de autenticação da conexão ter um lugar só.
type ConnectAuth struct {
	tokens *auth.Service
}

func NewConnectAuth(tokens *auth.Service) *ConnectAuth {
	return &ConnectAuth{tokens: tokens}
}

// tokenUser: quem o token deixa conectar — a conta (token de acesso) ou o
// visitante sem conta (token de visitante, docs/adr/0017-visitante-na-call.md).
// O visitante não é membro de nada: o validador das salas só o deixa entrar na
// sala do próprio usuário e na da call em que está.
// O token de acesso também precisa ser da versão atual da sessão (ADR 0039).
func (a *ConnectAuth) tokenUser(ctx context.Context, token string) (string, bool) {
	claims, err := a.tokens.ValidateToken(token)
	if err != nil || (claims.Type != "access" && claims.Type != auth.TokenGuest) {
		return "", false
	}
	if a.tokens.CheckSession(ctx, claims) != nil {
		return "", false
	}
	return claims.UserID, true
}
