package websocket

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	"gin-quickstart/backend/internal/conversation"
	"gin-quickstart/backend/internal/permission"

	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"
)

// ChannelPermissions: as permissões do membro num canal (permission.Service).
type ChannelPermissions interface {
	ChannelPerms(ctx context.Context, channelID, userID string) (int64, error)
}

// ServerMembers: quem é membro do servidor (permission.Service, do cache).
type ServerMembers interface {
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
}

type Handler struct {
	hub                 *Hub
	connAuth            *ConnectAuth
	perms               ChannelPermissions
	members             ServerMembers
	conversationService *conversation.Service
	callRouter          CallRouter
	typing              TypingRouter
	// Conexões do app do celular (?client=mobile): o push usa para saber se o app está aberto.
	mobile *MobileApps
}

func WsHandler(hub *Hub, connAuth *ConnectAuth, perms ChannelPermissions, members ServerMembers, conversationService *conversation.Service, callRouter CallRouter, typing TypingRouter) *Handler {
	return &Handler{
		hub:                 hub,
		connAuth:            connAuth,
		perms:               perms,
		members:             members,
		conversationService: conversationService,
		callRouter:          callRouter,
		typing:              typing,
	}
}

// validator: userID pode entrar na sala pedida (uma por tipo).
func (h *Handler) validator(ctx context.Context, userID string, channelID string, conversationID string, serverID string, userRoomID string, callID string) bool {
	switch {
	case userRoomID != "":
		return userRoomID == userID
	case serverID != "":
		return h.canJoinServer(ctx, serverID, userID)
	case channelID != "":
		return h.canJoinChannel(ctx, channelID, userID)
	case conversationID != "":
		return h.canJoinConversation(ctx, conversationID, userID)
	case callID != "":
		return h.callRouter != nil && h.callRouter.IsParticipant(callID, userID)
	}
	return false
}

func (h *Handler) canJoinServer(ctx context.Context, serverID, userID string) bool {
	isMember, err := h.members.IsMember(ctx, serverID, userID)
	return err == nil && isMember
}

// canJoinChannel: canal privado só para quem tem VIEW_CHANNEL.
func (h *Handler) canJoinChannel(ctx context.Context, channelID, userID string) bool {
	perms, err := h.perms.ChannelPerms(ctx, channelID, userID)
	return err == nil && permission.Has(perms, permission.ViewChannel)
}

func (h *Handler) canJoinConversation(ctx context.Context, conversationID, userID string) bool {
	isParticipant, err := h.conversationService.IsParticipant(ctx, conversationID, userID)
	return err == nil && isParticipant
}

func (h *Handler) ServeWS(c *gin.Context) {
	userID, ok := h.connAuth.connectUser(c.Request.Context(), c.Request)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
		// O app empacotado conecta a partir de file:// (sem host de origem) e a
		// autenticação já é feita pelo ?ticket= (ou ?token= legado), sem cookie:
		// a origem não é checada.
		InsecureSkipVerify: true,
	})
	if err != nil {
		return
	}
	defer h.trackMobile(c.Request.URL.Query(), userID)()
	h.serve(c.Request.Context(), conn, userID)
}

// trackMobile conta a conexão se ela é do app do celular (?client=mobile) e devolve o "fechou".
func (h *Handler) trackMobile(q url.Values, userID string) func() {
	if !isMobileClient(q) {
		return func() {}
	}
	return h.mobile.Track(userID)
}

// WithMobileApps liga o contador de conexões do app do celular.
func (h *Handler) WithMobileApps(m *MobileApps) *Handler {
	h.mobile = m
	return h
}

// serve registra a conexão no hub e fica lendo até ela fechar.
func (h *Handler) serve(parent context.Context, conn *websocket.Conn, userID string) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()

	client := &Client{
		cancel:     cancel,
		hub:        h.hub,
		conn:       conn,
		userID:     userID,
		send:       make(chan []byte, 32),
		rooms:      make(map[string]struct{}),
		validator:  h.validator,
		callRouter: h.callRouter,
		typing:     h.typing,
	}

	// Conexão que chegou enquanto o servidor desligava: manda para o processo
	// novo (a checagem e o registro são atômicos no hub).
	if !h.hub.Register(client) {
		_ = conn.Close(CloseServiceRestart, closeRestartReason)
		return
	}

	go client.writePump(ctx)
	client.readPump(ctx)
}

func (h *Handler) Presence(c *gin.Context) {
	raw := c.Query("ids")
	if raw == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids query is required"})
		return
	}

	ids := strings.Split(raw, ",")
	presence := h.hub.PresenceMap(ids)

	c.JSON(http.StatusOK, presence)
}

// Activities devolve a atividade (jogo e música) de quem o usuário pode ver.
func (h *Handler) Activities(c *gin.Context) {
	raw := c.Query("ids")
	if raw == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids query is required"})
		return
	}
	userID := c.GetString("userID")
	c.JSON(http.StatusOK, h.hub.ActivitiesFor(c.Request.Context(), userID, strings.Split(raw, ",")))
}
