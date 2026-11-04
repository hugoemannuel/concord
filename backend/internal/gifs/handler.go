package gifs

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func NewHandler(apiKey string) *Handler {
	return &Handler{
		service: NewService(apiKey),
	}
}

func (h *Handler) Trending(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	items, err := h.service.Trending(c.Request.Context(), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch trending gifs"})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) Search(c *gin.Context) {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		h.Trending(c)
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	items, err := h.service.Search(c.Request.Context(), query, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to search gifs"})
		return
	}
	c.JSON(http.StatusOK, items)
}

func Routes(router *gin.RouterGroup, h *Handler, authMiddleware gin.HandlerFunc) {
	g := router.Group("/gifs")
	g.Use(authMiddleware)
	{
		g.GET("/trending", h.Trending)
		g.GET("/search", h.Search)
	}
}
