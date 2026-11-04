package proposal

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *Handler) Mentions(c *gin.Context) {
	list, err := h.service.PendingMentions(c.Request.Context(), c.GetString("userID"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"mentions": list})
}

// MarkMentionsSeen: com {"proposal_id": "..."} marca as de uma proposta; sem
// corpo ou com proposal_id vazio, todas.
func (h *Handler) MarkMentionsSeen(c *gin.Context) {
	var body struct {
		ProposalID *string `json:"proposal_id"`
	}
	if c.Request.ContentLength != 0 {
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
	}
	if body.ProposalID != nil {
		if _, err := uuid.Parse(*body.ProposalID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
	}
	if err := h.service.MarkMentionsSeen(c.Request.Context(), c.GetString("userID"), body.ProposalID); err != nil {
		h.fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
