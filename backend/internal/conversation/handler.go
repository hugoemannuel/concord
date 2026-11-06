package conversation

import (
	"context"
	"errors"
	"log"
	"net/http"

	"gin-quickstart/backend/internal/friendship"
	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// ImageUploader recebe o ícone do grupo (o mesmo upload do avatar).
type ImageUploader interface {
	UploadImage(c *gin.Context, apply user.ImageApply)
	RemoveMediaURL(url *string)
}

type Handler struct {
	service     *Service
	userService *user.Service
	images      ImageUploader
}

func ConversationHandler(service *Service, userService *user.Service, images ImageUploader) *Handler {
	return &Handler{
		service:     service,
		userService: userService,
		images:      images,
	}
}

// currentUser: o usuário autenticado (platform/authctx).
var currentUser = authctx.UserID

func respondError(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, ErrNotFound), errors.Is(err, friendship.ErrUserNotFound):
		status = http.StatusNotFound
	case errors.Is(err, ErrNotParticipant), errors.Is(err, ErrNotOwner),
		errors.Is(err, ErrOnlyFriends), errors.Is(err, friendship.ErrBlocked),
		errors.Is(err, friendship.ErrCannotMessage), errors.Is(err, friendship.ErrBotUser):
		status = http.StatusForbidden
	case errors.Is(err, ErrNotGroup), errors.Is(err, ErrIsGroup), errors.Is(err, ErrGroupFull),
		errors.Is(err, ErrGroupEmpty), errors.Is(err, ErrInvalidName):
		status = http.StatusBadRequest
	}
	if status == http.StatusInternalServerError {
		log.Printf("[conversation] %v", err)
		c.JSON(status, gin.H{"error": "internal error"})
		return
	}
	c.JSON(status, gin.H{"error": err.Error()})
}

func (h *Handler) List(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	summaries, err := h.service.ListByUserID(c.Request.Context(), userID)
	if err != nil {
		log.Printf("[conversation] list: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list conversations"})
		return
	}

	if c.Query("include_groups") != "1" && legacyDesktopWithoutGroups(c.Request.UserAgent()) {
		summaries = onlyDirectMessages(summaries)
	}

	c.JSON(http.StatusOK, summaries)
}

func (h *Handler) GetOrCreateWith(c *gin.Context) {
	otherUserID := c.Param("userId")

	userID, ok := currentUser(c)
	if !ok {
		return
	}

	if otherUserID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot start a conversation with yourself"})
		return
	}

	otherUser, err := h.userService.FindByID(c.Request.Context(), otherUserID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	conv, err := h.service.GetOrCreateWith(c.Request.Context(), userID, otherUser.ID)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, conv)
}

func (h *Handler) Get(c *gin.Context) {
	id := c.Param("id")

	userID, ok := currentUser(c)
	if !ok {
		return
	}

	isParticipant, err := h.service.IsParticipant(c.Request.Context(), id, userID)
	if err != nil || !isParticipant {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not a participant of this conversation"})
		return
	}

	detail, err := h.service.Detail(c.Request.Context(), id)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, detail)
}

func (h *Handler) CreateGroup(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	var input struct {
		UserIDs []string `json:"user_ids"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	conv, err := h.service.CreateGroup(c.Request.Context(), userID, input.UserIDs)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusCreated, conv)
}

func (h *Handler) Update(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	var input struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if err := h.service.Rename(c.Request.Context(), userID, c.Param("id"), input.Name); err != nil {
		respondError(c, err)
		return
	}

	h.respondDetail(c)
}

func (h *Handler) UploadIcon(c *gin.Context) {
	id := c.Param("id")
	h.images.UploadImage(c, func(ctx context.Context, userID string, url *string) (*string, bool) {
		old, err := h.service.SetIcon(ctx, userID, id, url)
		if err != nil {
			respondError(c, err)
			return nil, false
		}
		h.respondDetail(c)
		return old, true
	})
}

func (h *Handler) DeleteIcon(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	old, err := h.service.SetIcon(c.Request.Context(), userID, c.Param("id"), nil)
	if err != nil {
		respondError(c, err)
		return
	}
	h.images.RemoveMediaURL(old)

	h.respondDetail(c)
}

func (h *Handler) respondDetail(c *gin.Context) {
	detail, err := h.service.Detail(c.Request.Context(), c.Param("id"))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (h *Handler) AddMembers(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	var input struct {
		UserIDs []string `json:"user_ids"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if err := h.service.AddMembers(c.Request.Context(), userID, c.Param("id"), input.UserIDs); err != nil {
		respondError(c, err)
		return
	}

	h.respondDetail(c)
}

// RemoveMember: ":userId" = "me" sai do grupo.
func (h *Handler) RemoveMember(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	target := c.Param("userId")
	if target == "me" {
		target = userID
	}

	if err := h.service.RemoveMember(c.Request.Context(), userID, c.Param("id"), target); err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "member removed"})
}

func (h *Handler) Hide(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	if err := h.service.Hide(c.Request.Context(), userID, c.Param("id")); err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "conversation closed"})
}

func (h *Handler) MarkRead(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}

	var input struct {
		MessageID string `json:"message_id"`
	}
	// Corpo vazio = marcar tudo como lido.
	_ = c.ShouldBindJSON(&input)

	if err := h.service.MarkRead(c.Request.Context(), userID, c.Param("id"), input.MessageID); err != nil {
		respondError(c, err)
		return
	}

	c.Status(http.StatusNoContent)
}
