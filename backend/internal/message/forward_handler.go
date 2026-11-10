package message

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// HTTP do encaminhamento (forward.go): a origem vem na rota, o destino no corpo.

type ForwardHandler struct {
	forwarder *Forwarder
	targets   *ForwardTargets
}

func NewForwardHandler(forwarder *Forwarder, targets *ForwardTargets) *ForwardHandler {
	return &ForwardHandler{forwarder: forwarder, targets: targets}
}

type forwardInput struct {
	ChannelID      string `json:"channel_id"`
	ConversationID string `json:"conversation_id"`
	Comment        string `json:"comment"`
}

// FromChannel: POST /channels/:channelId/messages/:messageId/forward.
func (h *ForwardHandler) FromChannel(c *gin.Context) {
	h.forward(c, Room{ChannelID: c.Param("channelId")})
}

// FromConversation: POST /conversations/:id/messages/:messageId/forward.
func (h *ForwardHandler) FromConversation(c *gin.Context) {
	h.forward(c, Room{ConversationID: c.Param("id")})
}

func (h *ForwardHandler) forward(c *gin.Context, origin Room) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	var input forwardInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	res, err := h.forwarder.Forward(c.Request.Context(), ForwardRequest{
		Origin:    origin,
		MessageID: c.Param("messageId"),
		UserID:    userID,
		Target:    Room{ChannelID: input.ChannelID, ConversationID: input.ConversationID},
		Comment:   input.Comment,
	})
	if err != nil {
		respondForwardError(c, err)
		return
	}
	c.JSON(http.StatusCreated, res)
}

// respondForwardError traduz o erro do encaminhamento; os de acesso à sala
// saem como em qualquer envio (respondRoomError).
func respondForwardError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidForwardTarget), errors.Is(err, ErrContentTooLong):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrNotForwardable):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "not_forwardable"})
	case errors.Is(err, ErrMessageNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, ErrForwardNoSpace):
		c.JSON(http.StatusInsufficientStorage, gin.H{"error": err.Error()})
	default:
		respondRoomError(c, err)
	}
}

// Targets: GET /forward/targets.
func (h *ForwardHandler) Targets(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	servers, err := h.targets.List(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list forward targets"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"servers": servers})
}

func ForwardRoutes(router *gin.RouterGroup, h *ForwardHandler, authMiddleware gin.HandlerFunc) {
	router.POST("/channels/:channelId/messages/:messageId/forward", authMiddleware, h.FromChannel)
	router.POST("/conversations/:id/messages/:messageId/forward", authMiddleware, h.FromConversation)
	router.GET("/forward/targets", authMiddleware, h.Targets)
}
