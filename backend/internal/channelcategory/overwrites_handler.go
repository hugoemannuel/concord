package channelcategory

import (
	"net/http"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
	"github.com/gin-gonic/gin"
)

// Mexer nas regras muda quem vê os canais vinculados: é o mesmo que editar as
// permissões deles, então exige MANAGE_ROLES além de MANAGE_CHANNELS.
const managePermissions = permission.ManageChannels | permission.ManageRoles

// setOverwrite: PUT /servers/:id/categories/:categoryId/overwrites/:type/:targetId {allow, deny}.
func (h *Handler) setOverwrite(c *gin.Context) {
	var input struct {
		Allow int64 `json:"allow"`
		Deny  int64 `json:"deny"`
	}
	if c.ShouldBindJSON(&input) != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	h.changeOverwrite(c, &permission.Overwrite{
		TargetType: c.Param("type"),
		TargetID:   c.Param("targetId"),
		Allow:      permission.Normalize(input.Allow),
		Deny:       permission.Normalize(input.Deny),
	})
}

// deleteOverwrite: tira a regra do cargo ou membro na categoria.
func (h *Handler) deleteOverwrite(c *gin.Context) { h.changeOverwrite(c, nil) }

func (h *Handler) changeOverwrite(c *gin.Context, next *permission.Overwrite) {
	snap, user, ok := h.visibleCategory(c, managePermissions)
	if !ok {
		return
	}
	kind, target := c.Param("type"), c.Param("targetId")
	if !validTarget(snap, kind, target) {
		respondError(c, ErrInvalidTarget)
		return
	}
	if next != nil && next.Allow&next.Deny != 0 {
		respondError(c, ErrInvalidOverwrite)
		return
	}
	change, err := h.store.Update(c.Request.Context(), c.Param("id"), c.Param("categoryId"), CategoryUpdate{
		Overwrites: func(current []permission.Overwrite) ([]permission.Overwrite, error) {
			after := withOverwrite(current, kind, target, next)
			return after, checkGrant(snap, user, current, after)
		},
	})
	if respondError(c, err) {
		return
	}
	h.changed(c.Param("id"), true)
	h.recordUpdate(c.Request.Context(), updatedEvent(c.Param("id"), user, snap.Everyone.ID, change))
	c.Status(http.StatusNoContent)
}

// syncChannel: POST /servers/:id/categories/channels/:channelId/sync. O canal volta a
// seguir a categoria e perde as regras próprias.
func (h *Handler) syncChannel(c *gin.Context) {
	snap, user, ok := h.authorize(c, managePermissions)
	if !ok {
		return
	}
	channel := c.Param("channelId")
	info, known := snap.Channels[channel]
	if !known || !snap.CanView(channel, user) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if !permission.CanGrant(snap.Channel(channel, user), changedBits(info.Overwrites, snap.Categories[info.CategoryID].Overwrites)) {
		respondError(c, ErrCannotGrant)
		return
	}
	category, err := h.store.SyncChannel(c.Request.Context(), c.Param("id"), channel)
	if respondError(c, err) {
		return
	}
	h.changed(c.Param("id"), true)
	h.record(c.Request.Context(), audit.Event{
		ServerID: c.Param("id"), ActorID: user, Action: audit.ChannelSync,
		TargetType: audit.TargetChannel, TargetID: channel,
		Changes: []audit.Change{{Field: "category", After: category.Name}},
	})
	c.Status(http.StatusNoContent)
}
