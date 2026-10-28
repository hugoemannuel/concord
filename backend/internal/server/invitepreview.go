package server

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/ratelimit"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Limite da prévia do convite (pública, sem login): por IP, em memória.
const (
	invitePreviewPerIP   = 60
	invitePreviewWindow  = time.Minute
	invitePreviewMaxKeys = 10000
	// A prévia de cada código fica guardada esse tempo: quem tem o link não
	// consegue acompanhar o "online" segundo a segundo (nem custa uma consulta
	// por pedido). Entrar pelo código ou gerar link novo limpa na hora.
	invitePreviewTTL = 45 * time.Second
)

// InvitePreview é o que a página do link de convite mostra antes de entrar,
// para quem nem tem conta: nada de e-mail, dono, id ou lista de membros. O id
// do servidor só vai para quem está logado (invitePreviewResponse).
type InvitePreview struct {
	ServerID    string  `json:"-"`
	Name        string  `json:"name"`
	IconURL     *string `json:"icon_url,omitempty"`
	MemberCount int     `json:"member_count"`
	OnlineCount int     `json:"online_count"`
}

// invitePreviewResponse: a prévia e, para quem está logado (o modal dentro do
// app), o id do servidor e se a pessoa já é membro ("Abrir servidor").
type invitePreviewResponse struct {
	ServerID    string  `json:"server_id,omitempty"`
	Name        string  `json:"name"`
	IconURL     *string `json:"icon_url,omitempty"`
	MemberCount int     `json:"member_count"`
	OnlineCount int     `json:"online_count"`
	IsMember    *bool   `json:"is_member,omitempty"`
}

// InvitePreviewer: a prévia de um código e se alguém já é membro (Service).
type InvitePreviewer interface {
	InvitePreview(ctx context.Context, code string) (*InvitePreview, error)
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
}

// InviteCodePublisher avisa quem pode convidar que o link mudou (websocket.Hub).
type InviteCodePublisher interface {
	PublishInviteCode(serverID, code string)
}

// previewCache guarda a prévia de cada código por ttl, com no máximo maxKeys
// códigos (cheio: varre os vencidos e, se precisar, esvazia). O nil não guarda nada.
type previewCache struct {
	mu      sync.Mutex
	ttl     time.Duration
	maxKeys int
	entries map[string]previewEntry
	now     func() time.Time
}

type previewEntry struct {
	preview   *InvitePreview
	expiresAt time.Time
}

func newPreviewCache(ttl time.Duration, maxKeys int) *previewCache {
	return &previewCache{ttl: ttl, maxKeys: maxKeys, entries: map[string]previewEntry{}, now: time.Now}
}

func (c *previewCache) get(code string) *InvitePreview {
	if c == nil {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[code]
	if !ok {
		return nil
	}
	if !c.now().Before(e.expiresAt) {
		delete(c.entries, code)
		return nil
	}
	return e.preview
}

func (c *previewCache) put(code string, p *InvitePreview) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	if _, ok := c.entries[code]; !ok && len(c.entries) >= c.maxKeys {
		for k, e := range c.entries {
			if !now.Before(e.expiresAt) {
				delete(c.entries, k)
			}
		}
		if len(c.entries) >= c.maxKeys {
			c.entries = map[string]previewEntry{}
		}
	}
	c.entries[code] = previewEntry{preview: p, expiresAt: now.Add(c.ttl)}
}

// forgetServer tira as prévias do servidor (alguém entrou, link novo).
func (c *previewCache) forgetServer(serverID string) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, e := range c.entries {
		if e.preview.ServerID == serverID {
			delete(c.entries, k)
		}
	}
}

func (c *previewCache) len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

// PresenceLookup devolve o status que os outros veem de cada id
// (websocket.Hub.PresenceMap: "offline" se desconectado ou invisível).
type PresenceLookup func(userIDs []string) map[string]string

// validInviteCode: só o formato que newInviteCode gera (e um pouco de folga),
// já normalizado. O resto nem chega ao banco.
func validInviteCode(code string) bool {
	if len(code) < 4 || len(code) > 16 {
		return false
	}
	for _, r := range code {
		if (r < 'A' || r > 'Z') && (r < '0' || r > '9') {
			return false
		}
	}
	return true
}

// countOnline conta quem os outros veem como online (invisível não conta).
func countOnline(userIDs []string, presence PresenceLookup) int {
	if presence == nil || len(userIDs) == 0 {
		return 0
	}
	online := 0
	for _, status := range presence(userIDs) {
		if status != user.StatusOffline {
			online++
		}
	}
	return online
}

// SetPresence liga a contagem de online da prévia do convite.
func (s *Service) SetPresence(presence PresenceLookup) {
	s.presence = presence
}

// InvitePreview: servidor do código, com membros e online. Código malformado
// ou que não existe é ErrInvalidCode.
func (s *Service) InvitePreview(ctx context.Context, rawCode string) (*InvitePreview, error) {
	code := normalizeInviteCode(rawCode)
	if !validInviteCode(code) {
		return nil, ErrInvalidCode
	}
	if cached := s.previews.get(code); cached != nil {
		return cached, nil
	}
	preview, memberIDs, err := s.repository.InvitePreview(ctx, code)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvalidCode
	}
	if err != nil {
		return nil, err
	}
	preview.MemberCount = len(memberIDs)
	preview.OnlineCount = countOnline(memberIDs, s.presence)
	s.previews.put(code, preview)
	return preview, nil
}

// RotateInviteCode troca o código do servidor por um novo (mesmo formato e
// aleatoriedade): o link antigo para de funcionar na hora. Quem chama já
// conferiu CREATE_INVITE.
func (s *Service) RotateInviteCode(ctx context.Context, serverID string, actorID string) (string, error) {
	for attempt := 0; attempt < 3; attempt++ {
		code := newInviteCode()
		mark := &audit.Mark{ServerID: serverID, ActorID: actorID, Action: audit.ServerInviteCodeReset}
		err := s.repository.SetInviteCode(ctx, serverID, code, mark)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			continue // outro servidor já tem esse código (raríssimo): sorteia de novo
		}
		if err != nil {
			return "", err
		}
		s.previews.forgetServer(serverID)
		if pub, ok := s.publisher.(InviteCodePublisher); ok {
			pub.PublishInviteCode(serverID, code)
		}
		return code, nil
	}
	return "", errors.New("could not generate a unique invite code")
}

// InvitePreview responde GET /invites/:id/preview (o :id é o código; o nome
// do parâmetro tem que ser o mesmo das outras rotas de /invites no gin).
func (h *Handler) InvitePreview(c *gin.Context) {
	ctx := c.Request.Context()
	preview, err := h.previews.InvitePreview(ctx, c.Param("id"))
	if errors.Is(err, ErrInvalidCode) {
		c.JSON(http.StatusNotFound, gin.H{"error": "convite inválido ou expirado"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load invite"})
		return
	}
	res := invitePreviewResponse{
		Name:        preview.Name,
		IconURL:     preview.IconURL,
		MemberCount: preview.MemberCount,
		OnlineCount: preview.OnlineCount,
	}
	// Logado (OptionalAuthMiddleware): o modal do app precisa do id e de saber
	// se a pessoa já está no servidor. Anônimo não recebe id nenhum.
	if userID := c.GetString("userID"); userID != "" {
		isMember, err := h.previews.IsMember(ctx, preview.ServerID, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load invite"})
			return
		}
		res.ServerID = preview.ServerID
		res.IsMember = &isMember
	}
	c.JSON(http.StatusOK, res)
}

// RotateInviteCode responde POST /servers/:id/invite-code/reset ("Gerar novo
// link"): só quem tem CREATE_INVITE.
func (h *Handler) RotateInviteCode(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	serverID := c.Param("id")
	if err := h.perms.Require(c.Request.Context(), serverID, userID, permission.CreateInvite); err != nil {
		if !respondPermission(c, err) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset invite code"})
		}
		return
	}
	code, err := h.service.RotateInviteCode(c.Request.Context(), serverID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset invite code"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": code})
}

// limitByIP: no máximo o limite do limiter por IP (IPv6 por /64); passou, 429
// com Retry-After.
func limitByIP(limiter *ratelimit.Limiter, message string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if retry, ok := limiter.Allow(ratelimit.IPKey(c.ClientIP())); !ok {
			c.Header("Retry-After", ratelimit.RetryAfterSeconds(retry))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": message})
			return
		}
		c.Next()
	}
}
