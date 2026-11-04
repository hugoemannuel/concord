package proposal

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// failArchive traduz os erros do arquivamento; o resto cai no fail geral.
func (h *Handler) failArchive(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotArchivable):
		c.JSON(http.StatusConflict, gin.H{"error": "only done or rejected proposals can be archived", "code": "not_archivable"})
	case errors.Is(err, ErrArchived):
		c.JSON(http.StatusConflict, gin.H{"error": "proposal is archived", "code": "archived"})
	default:
		h.fail(c, err)
	}
}

// Archive: PUT /proposals/:id/archive (só o time tech).
func (h *Handler) Archive(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	p, err := h.service.Archive(c.Request.Context(), id, c.GetString("userID"))
	if err != nil {
		h.failArchive(c, err)
		return
	}
	c.JSON(http.StatusOK, p)
}

// Unarchive: DELETE /proposals/:id/archive (só o time tech).
func (h *Handler) Unarchive(c *gin.Context) {
	id, ok := proposalID(c)
	if !ok {
		return
	}
	p, err := h.service.Unarchive(c.Request.Context(), id, c.GetString("userID"))
	if err != nil {
		h.failArchive(c, err)
		return
	}
	c.JSON(http.StatusOK, p)
}

// ArchiveAll: POST /proposals/archive-all {"status": "done"|"rejected"} (padrão
// done; só o time tech).
func (h *Handler) ArchiveAll(c *gin.Context) {
	var body struct {
		Status string `json:"status"`
	}
	if c.Request.ContentLength != 0 {
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
	}
	if body.Status == "" {
		body.Status = StatusDone
	}
	ids, err := h.service.ArchiveAll(c.Request.Context(), c.GetString("userID"), body.Status)
	if err != nil {
		h.failArchive(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ids": ids})
}

// Archived: GET /proposals/archived?page=0&q=texto (qualquer pessoa logada).
func (h *Handler) Archived(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	res, err := h.service.Archived(c.Request.Context(), c.GetString("userID"), c.Query("q"), page)
	if err != nil {
		h.failArchive(c, err)
		return
	}
	c.JSON(http.StatusOK, res)
}
