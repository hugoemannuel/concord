package user

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Rotas da faixa e da moldura: o upload é o mesmo do avatar e do banner (com
// o quadro parado do GIF).

func (h *ProfileHandler) UploadNameplate(c *gin.Context)  { h.upload(c, h.service.SetNameplate) }
func (h *ProfileHandler) DeleteNameplate(c *gin.Context)  { h.remove(c, h.service.SetNameplate) }
func (h *ProfileHandler) UploadDecoration(c *gin.Context) { h.upload(c, h.service.SetDecoration) }
func (h *ProfileHandler) DeleteDecoration(c *gin.Context) { h.remove(c, h.service.SetDecoration) }

// SetNameplateMode recebe {"mode": "off" | "banner" | "custom"}.
func (h *ProfileHandler) SetNameplateMode(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	var input struct {
		Mode string `json:"mode"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	u, err := h.service.SetNameplateMode(c.Request.Context(), userID, input.Mode)
	if err != nil {
		respondProfileError(c, err)
		return
	}
	c.JSON(http.StatusOK, u.Self())
}
