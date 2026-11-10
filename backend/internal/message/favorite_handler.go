package message

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// HTTP das mensagens favoritas (favorite.go). A lista é da pessoa: as rotas
// ficam em /users/me, fora do canal e da DM.

type FavoriteHandler struct {
	s *FavoriteService
}

func NewFavoriteHandler(s *FavoriteService) *FavoriteHandler {
	return &FavoriteHandler{s: s}
}

func FavoriteRoutes(router *gin.RouterGroup, h *FavoriteHandler, authMiddleware gin.HandlerFunc) {
	favs := router.Group("/users/me/message-favorites")
	favs.Use(authMiddleware)
	{
		favs.GET("", h.List)
		favs.GET("/ids", h.IDs)
		favs.PUT("/:messageId", h.Add)
		favs.DELETE("/:messageId", h.Remove)
	}
}

// List: GET /users/me/message-favorites.
func (h *FavoriteHandler) List(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	favs, err := h.s.List(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list favorites"})
		return
	}
	c.JSON(http.StatusOK, favs)
}

// IDs: GET /users/me/message-favorites/ids.
func (h *FavoriteHandler) IDs(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	ids, err := h.s.IDs(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list favorites"})
		return
	}
	c.JSON(http.StatusOK, ids)
}

// Add: PUT /users/me/message-favorites/:messageId. Responde com o item novo.
func (h *FavoriteHandler) Add(c *gin.Context) {
	userID, messageID, ok := favoriteTarget(c)
	if !ok {
		return
	}
	fav, err := h.s.Add(c.Request.Context(), userID, messageID)
	switch {
	case err == nil:
		c.JSON(http.StatusOK, fav)
	case errors.Is(err, ErrMessageNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, ErrFavoritesFull):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "code": "favorites_full"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save favorite"})
	}
}

// Remove: DELETE /users/me/message-favorites/:messageId.
func (h *FavoriteHandler) Remove(c *gin.Context) {
	userID, messageID, ok := favoriteTarget(c)
	if !ok {
		return
	}
	if err := h.s.Remove(c.Request.Context(), userID, messageID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove favorite"})
		return
	}
	c.Status(http.StatusNoContent)
}

// favoriteTarget: quem pede e a mensagem; id que não é UUID já dá 404.
func favoriteTarget(c *gin.Context) (string, string, bool) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return "", "", false
	}
	messageID := c.Param("messageId")
	if _, err := uuid.Parse(messageID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": ErrMessageNotFound.Error()})
		return "", "", false
	}
	return userID, messageID, true
}
