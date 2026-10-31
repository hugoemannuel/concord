package channel

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// As rotas das sobrescritas de permissão do canal (e a trava dos canais de sala
// de evento). Extraído do handler.go sem mudar o comportamento.

// SetOverwrite: PUT /servers/:id/channels/:channelId/overwrites/:type/:targetId
// {allow, deny}. Exige MANAGE_ROLES no canal e só mexe em bits que o ator tem
// no canal.
func (h *Handler) SetOverwrite(c *gin.Context) {
	var input struct {
		Allow int64 `json:"allow"`
		Deny  int64 `json:"deny"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	h.changeOverwrite(c, &permission.Overwrite{
		TargetType: c.Param("type"),
		TargetID:   c.Param("targetId"),
		Allow:      permission.Normalize(input.Allow),
		Deny:       permission.Normalize(input.Deny),
	})
}

// DeleteOverwrite: volta o cargo/membro a herdar tudo do servidor.
func (h *Handler) DeleteOverwrite(c *gin.Context) {
	h.changeOverwrite(c, nil)
}

func (h *Handler) changeOverwrite(c *gin.Context, next *permission.Overwrite) {
	serverID, channelID := c.Param("id"), c.Param("channelId")
	targetType, targetID := c.Param("type"), c.Param("targetId")

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	snap, ch, herr := h.requireChannel(c.Request.Context(), serverID, channelID, userID.(string), permission.ManageRoles)
	if herr != nil {
		herr.respond(c)
		return
	}
	if refuseManaged(c, ch) {
		return
	}

	current, err := CheckOverwrite(snap, channelID, userID.(string), targetType, targetID, next)
	if err != nil {
		status, code := http.StatusBadRequest, "invalid"
		switch {
		case errors.Is(err, ErrCannotGrant):
			status, code = http.StatusForbidden, "cannot_grant"
		case errors.Is(err, ErrInvalidTarget):
			status, code = http.StatusNotFound, "invalid_target"
		}
		c.JSON(status, gin.H{"error": err.Error(), "code": code})
		return
	}

	if next == nil {
		err = h.service.DeleteOverwrite(c.Request.Context(), ch, targetType, targetID)
	} else {
		err = h.service.SetOverwrite(c.Request.Context(), ch, *next)
	}
	if err != nil {
		if errors.Is(err, ErrSystemChannel) {
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "system_channel"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to change permissions"})
		return
	}

	if next == nil {
		c.JSON(http.StatusOK, gin.H{"message": "overwrite deleted", "previous": current})
		return
	}
	next.ChannelID = channelID
	c.JSON(http.StatusOK, next)
}

// CheckOverwrite valida a troca da sobrescrita (next nil = apagar) e devolve a
// atual. O alvo tem que ser cargo ou membro do servidor; ninguém libera nem
// nega bits que não tem no canal.
func CheckOverwrite(snap *permission.Snapshot, channelID, actorID, targetType, targetID string, next *permission.Overwrite) (permission.Overwrite, error) {
	switch targetType {
	case permission.TargetRole:
		if _, ok := snap.Roles[targetID]; !ok {
			return permission.Overwrite{}, ErrInvalidTarget
		}
	case permission.TargetMember:
		if !snap.IsMember(targetID) {
			return permission.Overwrite{}, ErrInvalidTarget
		}
	default:
		return permission.Overwrite{}, ErrInvalidTarget
	}

	var current permission.Overwrite
	for _, o := range snap.Channels[channelID].Overwrites {
		if o.TargetType == targetType && o.TargetID == targetID {
			current = o
		}
	}

	var allow, deny int64
	if next != nil {
		if next.Allow&next.Deny != 0 {
			return current, ErrInvalidOverwrite
		}
		allow, deny = next.Allow, next.Deny
	}
	changed := (current.Allow ^ allow) | (current.Deny ^ deny)
	if !permission.CanGrant(snap.Channel(channelID, actorID), changed) {
		return current, ErrCannotGrant
	}
	return current, nil
}

// refuseManaged responde 403 se o canal é de uma sala de evento (só o evento o
// cria e apaga) e diz se respondeu.
func refuseManaged(c *gin.Context, ch *Channel) bool {
	if !ch.Managed {
		return false
	}
	c.JSON(http.StatusForbidden, gin.H{
		"error": "canal de evento: ele some sozinho quando o evento acaba ou é cancelado",
		"code":  "managed_channel",
	})
	return true
}
