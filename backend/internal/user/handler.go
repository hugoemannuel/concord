package user

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// userStore é a parte do Service que o Handler usa (trocável nos testes).
type userStore interface {
	FindByID(ctx context.Context, id string) (*User, error)
	SearchByUsername(ctx context.Context, query string, excludeUserID string) ([]User, error)
	GetBirthday(ctx context.Context, userID string) (*Birthday, error)
	SetBirthday(ctx context.Context, userID string, b Birthday) error
	UpdatePrivacy(ctx context.Context, id string, p Privacy) (*User, error)
}

type Handler struct {
	service userStore
}

func UserHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

func (h *Handler) GetMe(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	foundUser, err := h.service.FindByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, foundUser.Self())
}

func (h *Handler) SearchUsers(c *gin.Context) {
	username := c.Query("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username query is required"})
		return
	}

	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	users, err := h.service.SearchByUsername(c.Request.Context(), username, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to search users"})
		return
	}

	c.JSON(http.StatusOK, users)
}

// GetBirthday devolve o aniversário de quem está logado.
func (h *Handler) GetBirthday(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	birthday, err := h.service.GetBirthday(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, birthday)
}

// SetBirthday grava (ou apaga, com dia e mês vazios) o aniversário e se os
// servidores podem anunciar.
func (h *Handler) SetBirthday(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var input Birthday
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if err := h.service.SetBirthday(c.Request.Context(), userID.(string), input); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, ErrInvalidBirthday) {
			status = http.StatusBadRequest
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, input)
}

// GetPrivacy devolve as opções de privacidade de quem está logado.
func (h *Handler) GetPrivacy(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	foundUser, err := h.service.FindByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, foundUser.Privacy())
}

// UpdatePrivacy grava quem pode mandar pedido de amizade e DM.
func (h *Handler) UpdatePrivacy(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	var input Privacy
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	updated, err := h.service.UpdatePrivacy(c.Request.Context(), userID, input)
	if err != nil {
		if errors.Is(err, ErrInvalidPrivacy) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update privacy"})
		return
	}

	c.JSON(http.StatusOK, updated.Privacy())
}
