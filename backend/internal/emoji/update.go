package emoji

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
	before, status, err := h.manageable(c.Request.Context(), serverID, c.Param("emojiId"), actorID, ErrCannotEditEmoji)
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
	if !validName(input.Name) {
		return "", ErrInvalidName
	}
	return input.Name, nil
}

func updateErrorStatus(err error) int {
	switch {
	case errors.Is(err, ErrEmojiNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrNameTaken):
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}

func (h *Handler) publishUpdate(c *gin.Context, actorID string, before, after *Emoji) {
	if h.publisher != nil {
		h.publisher.BroadcastToRoom("server:"+after.ServerID, wsevent.Marshal("emoji:updated", UpdatedEvent{ServerID: after.ServerID, Emoji: *after}))
	}
	changes := audit.Diff(nil, "name", before.Name, after.Name)

	if h.audit != nil {
		h.audit.Record(c.Request.Context(), audit.Event{ServerID: after.ServerID, ActorID: actorID, Action: audit.EmojiUpdate, TargetType: audit.TargetEmoji, TargetID: after.ID, TargetName: after.Name, Changes: changes})
	}
}
