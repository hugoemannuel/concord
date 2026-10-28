package audit

import (
	"errors"
	"net/http"
	"strconv"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func AuditHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// List: GET /servers/:id/audit-logs?action=&actor_id=&before=&limit=
func (h *Handler) List(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	filter, err := parseFilter(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "invalid"})
		return
	}
	page, err := h.service.List(c.Request.Context(), c.Param("id"), userID, filter)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, page)
}

func parseFilter(c *gin.Context) (Filter, error) {
	f := Filter{ActorID: c.Query("actor_id"), Action: Action(c.Query("action"))}
	if raw := c.Query("before"); raw != "" {
		before, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return f, ErrInvalidFilter
		}
		f.Before = before
	}
	if raw := c.Query("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil {
			return f, ErrInvalidFilter
		}
		f.Limit = limit
	}
	return f, nil
}

func respondError(c *gin.Context, err error) {
	if status, code, ok := permission.HTTPError(err); ok {
		c.JSON(status, gin.H{"error": err.Error(), "code": code})
		return
	}
	if errors.Is(err, ErrInvalidFilter) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "invalid"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load audit log", "code": "internal"})
}
