package audit

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// List: GET /servers/:id/audit-log?actor_id=&action=&before=&limit=
func (h *Handler) List(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	f, err := parseFilter(c)
	if err == nil {
		var page Page
		page, err = h.service.List(c.Request.Context(), c.Param("id"), userID, f)
		if err == nil {
			c.JSON(http.StatusOK, page)
			return
		}
	}
	respondError(c, err)
}

func parseFilter(c *gin.Context) (Filter, error) {
	f := Filter{ActorID: c.Query("actor_id"), Action: Action(c.Query("action"))}
	before, err := queryInt(c, "before")
	if err != nil {
		return f, err
	}
	limit, err := queryInt(c, "limit")
	f.Before, f.Limit = before, int(limit)
	return f, err
}

// queryInt: o número do parâmetro (0 se ausente).
func queryInt(c *gin.Context, key string) (int64, error) {
	raw := c.Query(key)
	if raw == "" {
		return 0, nil
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, ErrInvalidFilter
	}
	return n, nil
}

func respondError(c *gin.Context, err error) {
	if status, code, ok := permission.HTTPError(err); ok {
		c.JSON(status, gin.H{"error": err.Error(), "code": code})
		return
	}
	if errors.Is(err, ErrInvalidFilter) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "invalid_filter"})
		return
	}
	log.Printf("[auditoria] listar: %v", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "falha ao carregar o registro de auditoria"})
}
