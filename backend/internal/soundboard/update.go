package soundboard

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
	before, status, err := h.manageable(c.Request.Context(), serverID, c.Param("soundId"), actorID, ErrCannotEditSound)
	if err != nil {
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	name, emoji, err := readUpdate(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.repo.Update(c.Request.Context(), serverID, before.ID, name, emoji)
	if err != nil {
		c.JSON(updateErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	h.publishUpdate(c, actorID, before, updated)
	c.JSON(http.StatusOK, updated)
}

type updateInput struct {
	Name  string `json:"name"`
	Emoji string `json:"emoji"`
}

func readUpdate(c *gin.Context) (string, *string, error) {
	var input updateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		return "", nil, errors.New("Corpo JSON inválido.")
	}
	name, err := sanitizeName(input.Name)
	return name, sanitizeEmoji(input.Emoji), err
}

func updateErrorStatus(err error) int {
	if errors.Is(err, ErrSoundNotFound) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}

func (h *Handler) publishUpdate(c *gin.Context, actorID string, before, after *Sound) {
	if h.publisher != nil {
		h.publisher.BroadcastToRoom("server:"+after.ServerID, wsevent.Marshal("soundboard:updated", UpdatedEvent{ServerID: after.ServerID, Sound: *after}))
	}
	changes := audit.Diff(nil, "name", before.Name, after.Name)
	changes = audit.DiffPtr(changes, "emoji", before.Emoji, after.Emoji)
	if h.audit != nil {
		h.audit.Record(c.Request.Context(), audit.Event{ServerID: after.ServerID, ActorID: actorID, Action: audit.SoundUpdate, TargetType: audit.TargetSound, TargetID: after.ID, TargetName: after.Name, Changes: changes})
	}
}
