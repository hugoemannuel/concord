package sticker

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/platform/wsevent"

	"github.com/gin-gonic/gin"
)

// Update edita os metadados sem alterar o arquivo enviado.
func (h *Handler) Update(c *gin.Context) {
	actorID := c.GetString("userID")
	if actorID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Não autenticado."})
		return
	}
	serverID := c.Param("id")
	before, status, err := h.manageable(c.Request.Context(), serverID, c.Param("stickerId"), actorID, ErrCannotEditSticker)
	if err != nil {
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	name, err := readUpdate(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.repo.Update(c.Request.Context(), serverID, before.ID, name)
	if err != nil {
		c.JSON(updateErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	h.publishUpdate(c, actorID, before, updated)
	c.JSON(http.StatusOK, updated)
}

func readUpdate(c *gin.Context) (string, error) {
	var input struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		return "", errors.New("Corpo JSON inválido.")
	}
	return sanitizeName(input.Name)
}

func updateErrorStatus(err error) int {
	if errors.Is(err, ErrStickerNotFound) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}

func (h *Handler) publishUpdate(c *gin.Context, actorID string, before, after *Sticker) {
	if h.publisher != nil {
		h.publisher.BroadcastToRoom("server:"+after.ServerID, wsevent.Marshal("sticker:updated", UpdatedEvent{ServerID: after.ServerID, Sticker: *after}))
	}
	changes := audit.Diff(nil, "name", before.Name, after.Name)

	if h.audit != nil {
		h.audit.Record(c.Request.Context(), audit.Event{ServerID: after.ServerID, ActorID: actorID, Action: audit.StickerUpdate, TargetType: audit.TargetSticker, TargetID: after.ID, TargetName: after.Name, Changes: changes})
	}
}
