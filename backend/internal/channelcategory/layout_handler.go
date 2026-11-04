package channelcategory

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
	"github.com/gin-gonic/gin"
)

// AuditRecorder grava no registro de auditoria do servidor (audit.Recorder).
type AuditRecorder interface {
	Record(ctx context.Context, e audit.Event)
}

// SetAudit liga o registro de auditoria (no boot).
func (h *Handler) SetAudit(recorder AuditRecorder) { h.audit = recorder }

// layoutSaved é o "type" da auditoria de channel.reorder quando a organização
// inteira muda (os outros valores são "text" e "voice").
const layoutSaved = "layout"

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
	canView := func(channel string) bool { return snap.CanView(channel, user) }
	result, err := h.store.SaveLayout(c.Request.Context(), server, write, canView)
	if err != nil {
		respondLayoutError(c, err)
		return
	}
	if result.Changed {
		h.announceLayout(c.Request.Context(), server, user)
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

func (h *Handler) announceLayout(ctx context.Context, server, user string) {
	if h.publisher != nil {
		h.publisher.PublishCategoryChanged(server)
	}
	if h.audit != nil {
		h.audit.Record(ctx, audit.Event{
			ServerID: server, ActorID: user, Action: audit.ChannelReorder,
			Changes: []audit.Change{{Field: "type", After: layoutSaved}},
		})
	}
}
