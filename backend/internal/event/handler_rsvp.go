package event

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type rsvpBody struct {
	// Ponteiro: sem o campo é pedido inválido, não "não vou".
	Going *bool `json:"going"`
}

func (h *Handler) SetRSVP(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	var body rsvpBody
	if err := c.ShouldBindJSON(&body); err != nil || body.Going == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if err := h.svc.SetRSVP(c.Request.Context(), c.Param("id"), c.Param("eventId"), userID, *body.Going); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) ClearRSVP(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	if err := h.svc.ClearRSVP(c.Request.Context(), c.Param("id"), c.Param("eventId"), userID); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) ListGoing(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	going, err := h.svc.ListGoing(c.Request.Context(), c.Param("id"), c.Param("eventId"), userID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, going)
}
