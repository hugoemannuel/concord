package channelcategory

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"
	"github.com/gin-gonic/gin"
)

// saveLayout: PUT /servers/:id/categories/layout. Exige MANAGE_CHANNELS.
func (h *Handler) saveLayout(c *gin.Context) {
	snap, user, ok := h.authorize(c, permission.ManageChannels)
	if !ok {
		return
	}
	var write LayoutWrite
	if c.ShouldBindJSON(&write) != nil || write.Revision == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	server := c.Param("id")
	result, err := h.store.SaveLayout(c.Request.Context(), server, write, viewerOf(snap, user))
	if err != nil {
		respondLayoutError(c, err)
		return
	}
	if result.Changed {
		h.announceLayout(c.Request.Context(), server, user, result.Moved)
	}
	c.JSON(http.StatusOK, gin.H{"revision": result.Revision})
}

func respondLayoutError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidLayout):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "invalid_layout"})
	case errors.Is(err, ErrLayoutConflict):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "code": "layout_conflict"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save layout"})
	}
}

func (h *Handler) announceLayout(ctx context.Context, server, user string, moved bool) {
	h.changed(server, moved)
	h.record(ctx, reorderedEvent(server, user))
}
