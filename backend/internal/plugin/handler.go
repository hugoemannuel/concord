package plugin

import (
	"errors"
	"log"
	"net/http"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func NewHandler(s *Service) *Handler {
	return &Handler{service: s}
}

// List: GET /plugins
func (h *Handler) List(c *gin.Context) {
	list, err := h.service.Catalog(c.Request.Context(), c.GetString("userID"))
	respond(c, http.StatusOK, list, err)
}

// Create: POST /plugins
func (h *Handler) Create(c *gin.Context) {
	var d Draft
	if err := c.ShouldBindJSON(&d); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	p, err := h.service.Create(c.Request.Context(), c.GetString("userID"), d)
	respond(c, http.StatusCreated, p, err)
}

// Review: PATCH /plugins/:pluginId/review
func (h *Handler) Review(c *gin.Context) {
	var body struct {
		Status Status  `json:"status"`
		Note   *string `json:"note"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	p, err := h.service.Review(c.Request.Context(), c.GetString("userID"), c.Param("pluginId"), body.Status, body.Note)
	respond(c, http.StatusOK, p, err)
}

// ListServer: GET /servers/:id/plugins
func (h *Handler) ListServer(c *gin.Context) {
	list, err := h.service.ServerPlugins(c.Request.Context(), c.Param("id"), c.GetString("userID"))
	respond(c, http.StatusOK, list, err)
}

// Install: PUT /servers/:id/plugins/:pluginId
func (h *Handler) Install(c *gin.Context) {
	err := h.service.Install(c.Request.Context(), c.Param("id"), c.GetString("userID"), c.Param("pluginId"))
	respondEmpty(c, err)
}

// Uninstall: DELETE /servers/:id/plugins/:pluginId
func (h *Handler) Uninstall(c *gin.Context) {
	err := h.service.Uninstall(c.Request.Context(), c.Param("id"), c.GetString("userID"), c.Param("pluginId"))
	respondEmpty(c, err)
}

// SetEnabled: PUT /servers/:id/plugins/:pluginId/me
func (h *Handler) SetEnabled(c *gin.Context) {
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_body"})
		return
	}
	err := h.service.SetEnabled(c.Request.Context(), c.Param("id"), c.GetString("userID"), c.Param("pluginId"), body.Enabled)
	respondEmpty(c, err)
}

func respond(c *gin.Context, status int, body any, err error) {
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(status, body)
}

func respondEmpty(c *gin.Context, err error) {
	if err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

var errCodes = []struct {
	err    error
	status int
	code   string
}{
	{ErrForbidden, http.StatusForbidden, "forbidden"},
	{ErrInvalidName, http.StatusBadRequest, "invalid_name"},
	{ErrInvalidDescription, http.StatusBadRequest, "invalid_description"},
	{ErrInvalidURL, http.StatusBadRequest, "invalid_url"},
	{ErrInvalidTransition, http.StatusBadRequest, "invalid_transition"},
	{ErrNotApproved, http.StatusBadRequest, "not_approved"},
	{ErrNotFound, http.StatusNotFound, "not_found"},
}

func respondError(c *gin.Context, err error) {
	if status, code, ok := permission.HTTPError(err); ok {
		c.JSON(status, gin.H{"error": code})
		return
	}
	for _, e := range errCodes {
		if errors.Is(err, e.err) {
			c.JSON(e.status, gin.H{"error": e.code})
			return
		}
	}
	log.Printf("plugin: %v", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal_error"})
}
