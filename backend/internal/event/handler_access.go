package event

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Access: GET /servers/:id/events/access, o que a pessoa pode fazer com eventos.
func (h *Handler) Access(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	view, err := h.svc.Access(c.Request.Context(), c.Param("id"), userID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

// RoleSettings: GET /servers/:id/events/roles (só o dono), a configuração por cargo.
func (h *Handler) RoleSettings(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	roles, err := h.svc.RoleSettings(c.Request.Context(), c.Param("id"), userID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, roles)
}

type roleActionsBody struct {
	Create bool `json:"create"`
	Edit   bool `json:"edit"`
	Delete bool `json:"delete"`
	// Configure só vale se quem pede é o dono; para os outros o servidor mantém o que o cargo já tem.
	Configure bool `json:"configure"`
}

// SetRoleActions: PUT /servers/:id/events/roles/:roleId (só o dono). Tudo falso tira o cargo da lista de quem mexe em eventos.
func (h *Handler) SetRoleActions(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	var body roleActionsBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	actions := actionsOf(body.Create, body.Edit, body.Delete, body.Configure)
	if err := h.svc.SetRoleActions(c.Request.Context(), c.Param("id"), userID, c.Param("roleId"), actions); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
