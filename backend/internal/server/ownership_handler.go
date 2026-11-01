package server

import (
	"context"
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

type ownershipTransfer interface {
	Transfer(ctx context.Context, serverID, actorID, toID string) (*Server, error)
}

type OwnershipHandler struct {
	service ownershipTransfer
}

func NewOwnershipHandler(service ownershipTransfer) *OwnershipHandler {
	return &OwnershipHandler{service: service}
}

// Transfer: PUT /servers/:id/owner {user_id}.
func (h *OwnershipHandler) Transfer(c *gin.Context) {
	var in struct {
		UserID string `json:"user_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.UserID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "informe o novo dono"})
		return
	}
	srv, err := h.service.Transfer(c.Request.Context(), c.Param("id"), c.GetString("userID"), in.UserID)
	switch {
	case err == nil:
		c.JSON(http.StatusOK, srv)
	case errors.Is(err, ErrServerNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, ErrNotServerOwner):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, ErrInvalidNewOwner):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		log.Printf("[server] transferir posse: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "não foi possível transferir o servidor"})
	}
}

// OwnershipRoutes: PUT /servers/:id/owner (autenticada).
func OwnershipRoutes(router *gin.RouterGroup, h *OwnershipHandler, authMiddleware gin.HandlerFunc) {
	router.PUT("/servers/:id/owner", authMiddleware, h.Transfer)
}
