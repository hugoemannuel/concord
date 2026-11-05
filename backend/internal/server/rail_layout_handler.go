package server

import (
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

type RailLayoutHandler struct {
	service *RailLayoutService
}

func NewRailLayoutHandler(service *RailLayoutService) *RailLayoutHandler {
	return &RailLayoutHandler{service: service}
}

func (h *Handler) railLayoutService() *RailLayoutService {
	var pub UserEventPublisher
	if h.service != nil {
		if p, ok := h.service.publisher.(UserEventPublisher); ok {
			pub = p
		}
		return NewRailLayoutService(h.service.repository, pub)
	}
	return nil
}

func (h *Handler) GetRailLayout(c *gin.Context) {
	NewRailLayoutHandler(h.railLayoutService()).Get(c)
}

func (h *Handler) SetRailLayout(c *gin.Context) {
	NewRailLayoutHandler(h.railLayoutService()).Put(c)
}

// Get: GET /users/me/server-layout
func (h *RailLayoutHandler) Get(c *gin.Context) {
	items, err := h.service.Get(c.Request.Context(), c.GetString("userID"))
	if err != nil {
		log.Printf("[server] get rail layout: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, RailLayoutState{Items: items})
}

// Put: PUT /users/me/server-layout
func (h *RailLayoutHandler) Put(c *gin.Context) {
	var in RailLayoutState
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	items, err := h.service.Save(c.Request.Context(), c.GetString("userID"), in.Items)
	if err != nil {
		if errors.Is(err, ErrInvalidRailLayout) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		log.Printf("[server] save rail layout: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, RailLayoutState{Items: items})
}

func RailLayoutRoutes(router *gin.RouterGroup, handler *RailLayoutHandler, authMiddleware gin.HandlerFunc) {
	me := router.Group("/users/me")
	me.Use(authMiddleware)
	{
		me.GET("/server-layout", handler.Get)
		me.PUT("/server-layout", handler.Put)
	}
}
