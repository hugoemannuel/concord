package websocket

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"gin-quickstart/backend/internal/auth"

	"github.com/gin-gonic/gin"
)

// ConnectAuth decide quem abre o WebSocket. Fica fora do Handler (que cuida
// das salas e do hub) para a regra de autenticação da conexão ter um lugar só.
//
// O app pede POST /api/ws/ticket com o Bearer e conecta com ?ticket= (uso
// único, 30 s; docs/adr/0046). O ?token= com o token de acesso continua
// aceito para os apps antigos, contado no log até ser desligado.
type ConnectAuth struct {
	tokens  *auth.Service
	tickets *TicketStore
	legacy  atomic.Int64
	logf    func(format string, args ...any)
}

func NewConnectAuth(tokens *auth.Service) *ConnectAuth {
	return &ConnectAuth{tokens: tokens, tickets: NewTicketStore(TicketTTL), logf: log.Printf}
}

var errNotConnectToken = errors.New("token não abre o WebSocket")

// claimsFor: as credenciais do token, se ele pode abrir o WebSocket — a conta
// (token de acesso) ou o visitante sem conta (docs/adr/0017-visitante-na-call.md).
// O visitante não é membro de nada: o validador das salas só o deixa entrar na
// sala do próprio usuário e na da call em que está. O token de acesso também
// precisa ser da versão atual da sessão (ADR 0039).
func (a *ConnectAuth) claimsFor(ctx context.Context, token string) (*auth.Claims, error) {
	claims, err := a.tokens.ValidateToken(token)
	if err != nil || (claims.Type != "access" && claims.Type != auth.TokenGuest) {
		return nil, errNotConnectToken
	}
	if err := a.tokens.CheckSession(ctx, claims); err != nil {
		return nil, err
	}
	return claims, nil
}

func (a *ConnectAuth) tokenUser(ctx context.Context, token string) (string, bool) {
	claims, err := a.claimsFor(ctx, token)
	if err != nil {
		return "", false
	}
	return claims.UserID, true
}

// connectUser: quem está abrindo a conexão. Com ?ticket=, só ele vale (um
// ticket inválido não cai para o ?token= que viesse junto).
func (a *ConnectAuth) connectUser(ctx context.Context, r *http.Request) (string, bool) {
	q := r.URL.Query()
	if q.Has("ticket") {
		return a.ticketUser(ctx, q.Get("ticket"))
	}
	if !q.Has("token") {
		return "", false
	}
	user, ok := a.tokenUser(ctx, q.Get("token"))
	if ok {
		n := a.legacy.Add(1)
		a.logf("[ws] conexão com ?token= legado (%d desde o boot; cliente %s)", n, legacyClient(q, r.UserAgent()))
	}
	return user, ok
}

// ticketUser gasta o ticket e confere a sessão de novo: quem saiu de todos os
// dispositivos depois de pedir o ticket não entra.
func (a *ConnectAuth) ticketUser(ctx context.Context, ticket string) (string, bool) {
	claims, ok := a.tickets.Redeem(ticket)
	if !ok || a.tokens.CheckSession(ctx, &claims) != nil {
		return "", false
	}
	return claims.UserID, true
}

// LegacyCount: conexões com ?token= desde o boot (para saber quando desligar).
func (a *ConnectAuth) LegacyCount() int64 {
	return a.legacy.Load()
}

var appVersionRE = regexp.MustCompile(`(?i)salinha/[0-9.]+`)

// legacyClient: só o tipo de app e a versão (nada do user agent inteiro no log).
func legacyClient(q url.Values, userAgent string) string {
	if isMobileClient(q) {
		return "mobile"
	}
	if v := appVersionRE.FindString(userAgent); v != "" {
		return strings.ToLower(v)
	}
	return "navegador"
}

// IssueTicket: POST /api/ws/ticket com "Authorization: Bearer <token>" (conta
// ou visitante). Responde {ticket, expires_in}.
func (a *ConnectAuth) IssueTicket(c *gin.Context) {
	token, found := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
	if !found || token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	claims, err := a.claimsFor(c.Request.Context(), token)
	if err != nil {
		respondClaimsError(c, err)
		return
	}
	ticket, err := a.tickets.Issue(*claims)
	if err != nil {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "tente de novo"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ticket": ticket, "expires_in": int(TicketTTL / time.Second)})
}

// respondClaimsError: mesmas respostas do AuthMiddleware (revogada = 401 com
// code, para o app voltar ao login; banco fora = 503, ninguém é deslogado).
func respondClaimsError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errNotConnectToken):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
	case errors.Is(err, auth.ErrSessionRevoked):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "sessão encerrada", "code": "session_revoked"})
	default:
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "tente de novo"})
	}
}
