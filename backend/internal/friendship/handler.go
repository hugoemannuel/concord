package friendship

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func FriendshipHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

func (h *Handler) SendRequest(c *gin.Context) {
	var input struct {
		Username string `json:"username"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	result, err := h.service.SendRequest(c.Request.Context(), userID, input.Username)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "friend request " + result, "result": result})
}

func (h *Handler) AcceptRequest(c *gin.Context) {
	requesterUsername := c.Param("username")

	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	if err := h.service.AcceptRequest(c.Request.Context(), userID, requesterUsername); err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "friend request accepted"})
}

func (h *Handler) DeclineRequest(c *gin.Context) {
	requesterUsername := c.Param("username")

	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	if err := h.service.DeclineRequest(c.Request.Context(), userID, requesterUsername); err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "friend request declined"})
}

func (h *Handler) CancelRequest(c *gin.Context) {
	addresseeUsername := c.Param("username")

	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	if err := h.service.CancelRequest(c.Request.Context(), userID, addresseeUsername); err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "friend request cancelled"})
}

func (h *Handler) RemoveFriend(c *gin.Context) {
	friendUsername := c.Param("username")

	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	if err := h.service.RemoveFriend(c.Request.Context(), userID, friendUsername); err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "friend removed"})
}

func (h *Handler) ListFriends(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	friends, err := h.service.ListFriends(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list friends"})
		return
	}

	c.JSON(http.StatusOK, friends)
}

func (h *Handler) ListPending(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	pending, err := h.service.ListPending(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list pending requests"})
		return
	}

	c.JSON(http.StatusOK, pending)
}

// respondError traduz os erros do Service em status HTTP; o app mostra a
// mensagem certa pelo status e pelo código.
func respondError(c *gin.Context, err error) {
	status := http.StatusBadRequest
	code := "invalid"
	switch {
	case errors.Is(err, ErrUserNotFound):
		status, code = http.StatusNotFound, "user_not_found"
	case errors.Is(err, ErrFriendshipNotFound):
		status, code = http.StatusNotFound, "not_found"
	case errors.Is(err, ErrNotBlocked):
		status, code = http.StatusNotFound, "not_blocked"
	case errors.Is(err, ErrAlreadyFriends):
		status, code = http.StatusConflict, "already_friends"
	case errors.Is(err, ErrFriendshipExists):
		status, code = http.StatusConflict, "request_exists"
	case errors.Is(err, ErrYouBlocked):
		status, code = http.StatusConflict, "you_blocked"
	case errors.Is(err, ErrRequestNotAllowed):
		status, code = http.StatusForbidden, "not_allowed"
	case errors.Is(err, ErrCannotAddSelf), errors.Is(err, ErrCannotBlockSelf), errors.Is(err, ErrBotUser):
		code = "self"
	case errors.Is(err, ErrNotAddressee), errors.Is(err, ErrNotRequester),
		errors.Is(err, ErrNotPending), errors.Is(err, ErrNotFriends):
		code = "invalid_state"
	default:
		status, code = http.StatusInternalServerError, "internal"
	}
	msg := err.Error()
	if status == http.StatusInternalServerError {
		msg = "internal error"
	}
	c.JSON(status, gin.H{"error": msg, "code": code})
}

func (h *Handler) Block(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	if err := h.service.Block(c.Request.Context(), userID, c.Param("id")); err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user blocked"})
}

func (h *Handler) Unblock(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	if err := h.service.Unblock(c.Request.Context(), userID, c.Param("id")); err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user unblocked"})
}

func (h *Handler) ListBlocked(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	blocked, err := h.service.ListBlocked(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list blocked users"})
		return
	}

	c.JSON(http.StatusOK, blocked)
}

func (h *Handler) Relationship(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	rel, err := h.service.Relationship(c.Request.Context(), userID, c.Param("id"))
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, rel)
}
