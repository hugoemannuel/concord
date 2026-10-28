package call

import (
	"errors"
	"net/http"
	"time"

	"gin-quickstart/backend/internal/platform/livekit"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
	tokens  *livekit.TokenIssuer
	audit   voiceAuditRecorder
}

func CallHandler(service *Service, tokens *livekit.TokenIssuer) *Handler {
	return &Handler{
		service: service,
		tokens:  tokens,
	}
}

func (h *Handler) Create(c *gin.Context) {
	var input struct {
		Type           string `json:"type"`
		ConversationID string `json:"conversation_id"`
		ChannelID      string `json:"channel_id"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	ctx := c.Request.Context()

	switch input.Type {
	case TypeDM:
		if input.ConversationID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "conversation_id is required"})
			return
		}
		call, err := h.service.StartDM(ctx, userID.(string), input.ConversationID)
		if err != nil {
			c.JSON(mapStartError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, call)
	case TypeChannel:
		if input.ChannelID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "channel_id is required"})
			return
		}
		call, err := h.service.StartChannel(ctx, userID.(string), input.ChannelID)
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
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": ErrInvalidType.Error()})
	}
}

func (h *Handler) Active(c *gin.Context) {
	scope := c.Query("scope")
	id := c.Query("id")

	if scope != TypeDM && scope != TypeChannel && scope != "server" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scope must be dm, channel or server"})
		return
	}
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id query is required"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	ctx := c.Request.Context()

	if scope == TypeDM {
		isParticipant, err := h.service.conversationService.IsParticipant(ctx, id, userID.(string))
		if err != nil || !isParticipant {
			c.JSON(http.StatusForbidden, gin.H{"error": ErrNotParticipant.Error()})
			return
		}
	} else if scope == "server" {
		isMember, err := h.service.serverService.IsMember(ctx, id, userID.(string))
		if err != nil || !isMember {
			c.JSON(http.StatusForbidden, gin.H{"error": ErrNotMember.Error()})
			return
		}

		states, err := h.service.ListActiveByServer(ctx, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list active calls"})
			return
		}

		// Só os canais de voz que a pessoa vê.
		c.JSON(http.StatusOK, h.service.VisibleStates(ctx, id, userID.(string), states))
		return
	} else {
		ch, err := h.service.channelService.FindByID(ctx, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
			return
		}
		if !h.service.CanViewChannel(ctx, ch.ID, userID.(string)) {
			c.JSON(http.StatusForbidden, gin.H{"error": ErrNotMember.Error()})
			return
		}
	}

	call, err := h.service.FindActiveByScope(scope, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": ErrNotFound.Error()})
		return
	}

	state, err := h.service.GetState(ctx, call.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load call state"})
		return
	}

	c.JSON(http.StatusOK, state)
}

func (h *Handler) State(c *gin.Context) {
	callID := c.Param("id")

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	state, err := h.service.GetState(c.Request.Context(), callID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": ErrNotFound.Error()})
		return
	}

	allowed := false
	for _, p := range state.Participants {
		if p.UserID == userID.(string) {
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
	state.Activity = h.service.ActivityFor(callID, userID.(string))
	c.JSON(http.StatusOK, state)
}

func (h *Handler) Delete(c *gin.Context) {
	callID := c.Param("id")

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if err := h.service.EndByUser(c.Request.Context(), callID, userID.(string)); err != nil {
		status := http.StatusInternalServerError
		switch {
		case errors.Is(err, ErrNotFound):
			status = http.StatusNotFound
		case errors.Is(err, ErrNotAllowed):
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "call ended"})
}

// Token emite o JWT do LiveKit para a sala da chamada. Só participantes
// (quem já aceitou/entrou pelo fluxo call:*) recebem token.
func (h *Handler) Token(c *gin.Context) {
	callID := c.Param("id")

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if !h.service.IsParticipant(callID, userID.(string)) {
		c.JSON(http.StatusForbidden, gin.H{"error": ErrNotAllowed.Error()})
		return
	}

	// O nome vai no token para quem está só na mídia (fora da lista do
	// backend, ex.: queda do WS) aparecer com nome e não como "Usuário".
	name := h.service.mediaName(c.Request.Context(), userID.(string))

	token, err := h.tokens.Issue(callID, userID.(string), name, h.service.GrantFor(c.Request.Context(), callID, userID.(string)))
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
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
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
	if err := h.service.SaveScreenPreview(c.Param("id"), userID.(string), input.Image, time.Now()); err != nil {
		respondScreenPreview(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// GetScreenPreview: GET /calls/:id/screen-preview/:userId. image null = a
// miniatura foi pedida e ainda não chegou (tentar de novo em instantes).
func (h *Handler) GetScreenPreview(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	result, err := h.service.ScreenPreview(c.Request.Context(), c.Param("id"), c.Param("userId"), userID.(string), time.Now())
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
