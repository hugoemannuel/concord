package server

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// IconSetter grava o ícone novo (nil tira), avisa os membros e devolve o
// ícone antigo para apagar o arquivo.
type IconSetter interface {
	SetIcon(ctx context.Context, serverID string, url *string, actorID string) (*Server, *string, error)
}

func (h *Handler) Update(c *gin.Context) {
	serverID := c.Param("id")

	var input struct {
		Name string `json:"name"`
		// Sem icon_url o ícone fica como está (o app troca o ícone por
		// upload; só apps antigos mandam a URL).
		IconURL *string `json:"icon_url"`
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

	if err := h.perms.Require(c.Request.Context(), serverID, userID.(string), permission.ManageServer); err != nil {
		if !respondPermission(c, err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		}
		return
	}

	updated, err := h.service.Update(c.Request.Context(), serverID, input.Name, input.IconURL, userID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, updated)
}

func (h *Handler) Delete(c *gin.Context) {
	serverID := c.Param("id")

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	srv, err := h.service.FindByID(c.Request.Context(), serverID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}

	if srv.OwnerID != userID.(string) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the owner can delete the server"})
		return
	}

	if err := h.service.Delete(c.Request.Context(), serverID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete server"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "server deleted"})
}

// SetPrimaryChannel: dono ou moderador escolhe o canal principal.
func (h *Handler) SetPrimaryChannel(c *gin.Context) {
	serverID := c.Param("id")

	var input struct {
		ChannelID string `json:"channel_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.ChannelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "channel_id is required"})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if err := h.perms.Require(c.Request.Context(), serverID, userID.(string), permission.ManageServer); err != nil {
		if !respondPermission(c, err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		}
		return
	}

	updated, err := h.service.SetPrimaryChannel(c.Request.Context(), serverID, input.ChannelID, userID.(string))
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, ErrInvalidPrimaryChannel) {
			status = http.StatusBadRequest
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, updated)
}

// requireManageServer confere a permissão de editar o servidor antes de
// qualquer upload (false se já respondeu).
func (h *Handler) requireManageServer(c *gin.Context) bool {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return false
	}
	if err := h.perms.Require(c.Request.Context(), c.Param("id"), userID.(string), permission.ManageServer); err != nil {
		if !respondPermission(c, err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		}
		return false
	}
	return true
}

// UploadIcon troca o ícone por uma imagem ou GIF enviado (mesmo pipeline do
// avatar: tipo, tamanho e quadro estático do GIF).
func (h *Handler) UploadIcon(c *gin.Context) {
	if !h.requireManageServer(c) {
		return
	}
	serverID, actorID := c.Param("id"), c.GetString("userID")
	h.images.UploadImage(c, func(ctx context.Context, _ string, url *string) (*string, bool) {
		updated, old, err := h.icons.SetIcon(ctx, serverID, url, actorID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return nil, false
		}
		c.JSON(http.StatusOK, updated)
		return old, true
	})
}

// DeleteIcon tira o ícone do servidor e apaga o arquivo antigo.
func (h *Handler) DeleteIcon(c *gin.Context) {
	if !h.requireManageServer(c) {
		return
	}
	updated, old, err := h.icons.SetIcon(c.Request.Context(), c.Param("id"), nil, c.GetString("userID"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}
	h.images.RemoveMediaURL(old)
	c.JSON(http.StatusOK, updated)
}
