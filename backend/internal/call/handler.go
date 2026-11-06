package call

import (
	"context"
	"errors"
	"net/http"
	"time"

	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/platform/livekit"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service   *Service
	moderator VoiceModerator
	tokens    *livekit.TokenIssuer
	audit     AuditRecorder
	channels  ChannelFinder
}

func CallHandler(service *Service, tokens *livekit.TokenIssuer) *Handler {
	return &Handler{
		service:   service,
		moderator: service,
		tokens:    tokens,
	}
}

// startInput é o pedido de início de chamada (POST /calls).
type startInput struct {
	Type           string `json:"type"`
	ConversationID string `json:"conversation_id"`
	ChannelID      string `json:"channel_id"`
}

// missing devolve o erro de um pedido incompleto, ou "" se dá para começar.
func (in startInput) missing() string {
	switch in.Type {
	case TypeDM:
		if in.ConversationID == "" {
			return "conversation_id is required"
		}
	case TypeChannel:
		if in.ChannelID == "" {
			return "channel_id is required"
		}
	default:
		return ErrInvalidType.Error()
	}
	return ""
}

func (h *Handler) Create(c *gin.Context) {
	var input startInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if msg := input.missing(); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	call, err := h.start(c.Request.Context(), userID, input)
	respondStart(c, call, err)
}

func (h *Handler) start(ctx context.Context, userID string, in startInput) (*Call, error) {
	if in.Type == TypeDM {
		return h.service.StartDM(ctx, userID, in.ConversationID)
	}
	return h.service.StartChannel(ctx, userID, in.ChannelID)
}

func respondStart(c *gin.Context, call *Call, err error) {
	if errors.Is(err, ErrLocked) && call != nil {
		// Sala trancada: o cliente usa o call_id para pedir para entrar.
		c.JSON(http.StatusLocked, gin.H{"error": ErrLocked.Error(), "call_id": call.ID})
		return
	}
	if err != nil {
		c.JSON(mapStartError(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, call)
}

// scopeServer: GET /calls/active?scope=server lista as chamadas do servidor.
const scopeServer = "server"

// activeQueryError devolve o erro da consulta de chamada ativa, ou "".
func activeQueryError(scope, id string) string {
	if scope != TypeDM && scope != TypeChannel && scope != scopeServer {
		return "scope must be dm, channel or server"
	}
	if id == "" {
		return "id query is required"
	}
	return ""
}

func (h *Handler) Active(c *gin.Context) {
	scope, id := c.Query("scope"), c.Query("id")
	if msg := activeQueryError(scope, id); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if !h.canSeeScope(c, scope, id, userID) {
		return
	}
	if scope == scopeServer {
		h.respondServerActive(c, id, userID)
		return
	}
	h.respondScopeActive(c, scope, id)
}

// canSeeScope confere se a pessoa vê a DM, o servidor ou o canal; se não,
// já respondeu.
func (h *Handler) canSeeScope(c *gin.Context, scope, id, userID string) bool {
	switch scope {
	case TypeDM:
		return h.dmVisible(c, id, userID)
	case scopeServer:
		return h.serverVisible(c, id, userID)
	default:
		return h.channelVisible(c, id, userID)
	}
}

func (h *Handler) dmVisible(c *gin.Context, conversationID, userID string) bool {
	isParticipant, err := h.service.conversationService.IsParticipant(c.Request.Context(), conversationID, userID)
	if err != nil || !isParticipant {
		c.JSON(http.StatusForbidden, gin.H{"error": ErrNotParticipant.Error()})
		return false
	}
	return true
}

func (h *Handler) serverVisible(c *gin.Context, serverID, userID string) bool {
	isMember, err := h.service.serverService.IsMember(c.Request.Context(), serverID, userID)
	if err != nil || !isMember {
		c.JSON(http.StatusForbidden, gin.H{"error": ErrNotMember.Error()})
		return false
	}
	return true
}

func (h *Handler) channelVisible(c *gin.Context, channelID, userID string) bool {
	ctx := c.Request.Context()
	ch, err := h.service.channelService.FindByID(ctx, channelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return false
	}
	if !h.service.CanViewChannel(ctx, ch.ID, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": ErrNotMember.Error()})
		return false
	}
	return true
}

func (h *Handler) respondServerActive(c *gin.Context, serverID, userID string) {
	ctx := c.Request.Context()
	states, err := h.service.ListActiveByServer(ctx, serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list active calls"})
		return
	}
	// Só os canais de voz que a pessoa vê.
	c.JSON(http.StatusOK, h.service.VisibleStates(ctx, serverID, userID, states))
}

func (h *Handler) respondScopeActive(c *gin.Context, scope, id string) {
	call, err := h.service.FindActiveByScope(scope, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": ErrNotFound.Error()})
		return
	}
	state, err := h.service.GetState(c.Request.Context(), call.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load call state"})
		return
	}
	c.JSON(http.StatusOK, state)
}

func (h *Handler) State(c *gin.Context) {
	callID := c.Param("id")

	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	state, err := h.service.GetState(c.Request.Context(), callID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": ErrNotFound.Error()})
		return
	}

	allowed := false
	for _, p := range state.Participants {
		if p.UserID == userID {
			allowed = true
			break
		}
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": ErrNotAllowed.Error()})
		return
	}
	state.JoinRequests = h.service.joinRequestsOf(callID)

	// Só aqui (participante conferido): quem entra depois já vê a atividade.
	state.Activity = h.service.ActivityFor(callID, userID)
	c.JSON(http.StatusOK, state)
}

func (h *Handler) Delete(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if err := h.service.EndByUser(c.Request.Context(), c.Param("id"), userID); err != nil {
		c.JSON(endStatus(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "call ended"})
}

func endStatus(err error) int {
	switch {
	case errors.Is(err, ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrNotAllowed):
		return http.StatusForbidden
	default:
		return http.StatusInternalServerError
	}
}

// Token emite o JWT do LiveKit para a sala da chamada. Só participantes
// (quem já aceitou/entrou pelo fluxo call:*) recebem token.
func (h *Handler) Token(c *gin.Context) {
	callID := c.Param("id")

	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	if !h.service.IsParticipant(callID, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": ErrNotAllowed.Error()})
		return
	}

	// O nome vai no token para quem está só na mídia (fora da lista do
	// backend, ex.: queda do WS) aparecer com nome e não como "Usuário".
	name := h.service.mediaName(c.Request.Context(), userID)

	token, err := h.tokens.Issue(callID, userID, name, h.service.GrantFor(c.Request.Context(), callID, userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue media token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
}

func mapStartError(err error) int {
	switch {
	case errors.Is(err, ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrLocked):
		return http.StatusLocked
	case errors.Is(err, ErrBusy),
		errors.Is(err, ErrCalleeOffline),
		errors.Is(err, ErrNotParticipant),
		errors.Is(err, ErrBlocked),
		errors.Is(err, ErrNotMember),
		errors.Is(err, ErrInvalidType):
		return http.StatusBadRequest
	case errors.Is(err, ErrNoConnect):
		return http.StatusForbidden
	default:
		return http.StatusInternalServerError
	}
}

// screenPreviewBodyLimit cobre a miniatura em base64 e o JSON em volta.
const screenPreviewBodyLimit = MaxScreenPreviewBytes*4/3 + 1024

func respondScreenPreview(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, ErrStreamNotActive):
		c.JSON(http.StatusNotFound, gin.H{"error": "stream_not_active"})
	case errors.Is(err, ErrNotAllowed):
		c.JSON(http.StatusForbidden, gin.H{"error": ErrNotAllowed.Error()})
	case errors.Is(err, ErrInvalidPreview):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrPreviewTooFrequent):
		c.JSON(http.StatusTooManyRequests, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to handle preview"})
	}
}

// PutScreenPreview: PUT /calls/:id/screen-preview {image: base64 do JPEG}.
// Quem transmite manda a miniatura quando o servidor pede.
func (h *Handler) PutScreenPreview(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, screenPreviewBodyLimit)
	var input struct {
		// []byte: o JSON traz base64.
		Image []byte `json:"image"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": ErrInvalidPreview.Error()})
		return
	}
	if err := h.service.SaveScreenPreview(c.Param("id"), userID, input.Image, time.Now()); err != nil {
		respondScreenPreview(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// GetScreenPreview: GET /calls/:id/screen-preview/:userId. image null = a
// miniatura foi pedida e ainda não chegou (tentar de novo em instantes).
func (h *Handler) GetScreenPreview(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	result, err := h.service.ScreenPreview(c.Request.Context(), c.Param("id"), c.Param("userId"), userID, time.Now())
	if err != nil {
		respondScreenPreview(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	if result.Image == nil {
		c.JSON(http.StatusOK, gin.H{"image": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"image": result.Image, "captured_at": result.At.UTC()})
}
