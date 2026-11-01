package apptheme

import (
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// MaxBodyBytes: 10 temas cabem em ~3 KB; o resto é lixo.
const MaxBodyBytes = 32 << 10

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

type body struct {
	Themes []Theme `json:"themes"`
}

func (h *Handler) fail(c *gin.Context, err error) {
	if errors.Is(err, ErrInvalidThemes) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid app themes"})
		return
	}
	log.Printf("[apptheme] %v", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
}

// Get: GET /users/me/app-themes
func (h *Handler) Get(c *gin.Context) {
	themes, err := h.service.Get(c.Request.Context(), c.GetString("userID"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, body{Themes: themes})
}

// Save: PUT /users/me/app-themes com a lista inteira.
func (h *Handler) Save(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxBodyBytes)
	var in body
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	themes, err := h.service.Save(c.Request.Context(), c.GetString("userID"), in.Themes)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, body{Themes: themes})
}
