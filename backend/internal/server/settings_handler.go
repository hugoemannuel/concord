package server

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// Configurações do servidor: nome, ícone, canal principal e o Maestro.

// ServerSettings é o que as configurações usam do Service.
type ServerSettings interface {
	FindByID(ctx context.Context, id string) (*Server, error)
	Update(ctx context.Context, id string, name string, iconURL *string) (*Server, error)
	SetPrimaryChannel(ctx context.Context, serverID string, channelID string) (*Server, error)
	SetMusicBot(ctx context.Context, serverID, actorID string, enabled bool) error
}

func (h *Handler) Update(c *gin.Context) {
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
	if !h.requireManageServer(c) {
		return
	}
	ctx, serverID := c.Request.Context(), c.Param("id")
	before, _ := h.settings.FindByID(ctx, serverID)
	updated, err := h.settings.Update(ctx, serverID, input.Name, input.IconURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.recordServerUpdate(ctx, c.GetString("userID"), before, updated)
	c.JSON(http.StatusOK, updated)
}

// SetPrimaryChannel: dono ou moderador escolhe o canal principal.
func (h *Handler) SetPrimaryChannel(c *gin.Context) {
	var input struct {
		ChannelID string `json:"channel_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.ChannelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "channel_id is required"})
		return
	}
	if !h.requireManageServer(c) {
		return
	}
	ctx, serverID := c.Request.Context(), c.Param("id")
	before, _ := h.settings.FindByID(ctx, serverID)
	updated, err := h.settings.SetPrimaryChannel(ctx, serverID, input.ChannelID)
	if err != nil {
		c.JSON(primaryChannelStatus(err), gin.H{"error": err.Error()})
		return
	}
	h.recordPrimaryChannel(ctx, c.GetString("userID"), before, updated)
	c.JSON(http.StatusOK, updated)
}

func primaryChannelStatus(err error) int {
	if errors.Is(err, ErrInvalidPrimaryChannel) {
		return http.StatusBadRequest
	}
	return http.StatusInternalServerError
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
	serverID := c.Param("id")
	h.images.UploadImage(c, func(ctx context.Context, _ string, url *string) (*string, bool) {
		updated, old, err := h.icons.SetIcon(ctx, serverID, url)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return nil, false
		}
		h.recordIcon(ctx, c.GetString("userID"), updated, old)
		c.JSON(http.StatusOK, updated)
		return old, true
	})
}

// DeleteIcon tira o ícone do servidor e apaga o arquivo antigo.
func (h *Handler) DeleteIcon(c *gin.Context) {
	if !h.requireManageServer(c) {
		return
	}
	updated, old, err := h.icons.SetIcon(c.Request.Context(), c.Param("id"), nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}
	h.recordIcon(c.Request.Context(), c.GetString("userID"), updated, old)
	h.images.RemoveMediaURL(old)
	c.JSON(http.StatusOK, updated)
}

func (h *Handler) EnableMusicBot(c *gin.Context)  { h.setMusicBot(c, true) }
func (h *Handler) DisableMusicBot(c *gin.Context) { h.setMusicBot(c, false) }

func (h *Handler) setMusicBot(c *gin.Context, enabled bool) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if err := h.settings.SetMusicBot(c.Request.Context(), c.Param("id"), userID.(string), enabled); err != nil {
		if errors.Is(err, ErrOnlyOwnerBot) {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}
	h.recordMusicBot(c.Request.Context(), c.Param("id"), userID.(string), enabled)
	c.Status(http.StatusNoContent)
}
