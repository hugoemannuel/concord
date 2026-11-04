package channelcategory

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"gin-quickstart/backend/internal/permission"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

type Permissions interface {
	Snapshot(context.Context, string) (*permission.Snapshot, error)
}
type Publisher interface{ PublishCategoryChanged(string) }
type Handler struct {
	store     Store
	perms     Permissions
	publisher Publisher
	audit     AuditRecorder
}

func NewHandler(store Store, perms Permissions, publisher Publisher) *Handler {
	return &Handler{store: store, perms: perms, publisher: publisher}
}

func Routes(api *gin.RouterGroup, h *Handler, auth gin.HandlerFunc) {
	g := api.Group("/servers/:id/categories", auth)
	g.GET("", h.list)
	g.POST("", h.create)
	g.PUT("/layout", h.saveLayout)
	g.PUT("/:categoryId", h.rename)
	g.DELETE("/:categoryId", h.delete)
	g.PUT("/:categoryId/order", h.moveCategory)
	g.PUT("/channels/:channelId", h.moveChannel)
}

func (h *Handler) authorize(c *gin.Context, want int64) (*permission.Snapshot, string, bool) {
	value, ok := c.Get("userID")
	if !ok {
		c.AbortWithStatus(http.StatusUnauthorized)
		return nil, "", false
	}
	user, ok := value.(string)
	if !ok {
		c.AbortWithStatus(http.StatusUnauthorized)
		return nil, "", false
	}
	snap, err := h.perms.Snapshot(c.Request.Context(), c.Param("id"))
	if err != nil || snap == nil || !snap.IsMember(user) || !permission.Has(snap.Server(user), want) {
		c.AbortWithStatus(http.StatusForbidden)
		return nil, "", false
	}
	return snap, user, true
}

func (h *Handler) list(c *gin.Context) {
	snap, user, ok := h.authorize(c, 0)
	if !ok {
		return
	}
	layout, err := h.store.List(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.AbortWithStatus(500)
		return
	}
	layout = visibleLayout(layout, func(channel string) bool { return snap.CanView(channel, user) })
	layout.Revision = layoutRevision(layout)
	c.JSON(http.StatusOK, layout)
}

func categoryName(c *gin.Context) (string, bool) {
	var input struct {
		Name string `json:"name"`
	}
	if c.ShouldBindJSON(&input) != nil {
		c.AbortWithStatus(400)
		return "", false
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || utf8.RuneCountInString(name) > 100 {
		c.AbortWithStatus(400)
		return "", false
	}
	return name, true
}

func (h *Handler) done(c *gin.Context, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		c.AbortWithStatus(404)
		return
	}
	if err != nil {
		c.AbortWithStatus(500)
		return
	}
	if h.publisher != nil {
		h.publisher.PublishCategoryChanged(c.Param("id"))
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) create(c *gin.Context) {
	if _, _, ok := h.authorize(c, permission.ManageChannels); !ok {
		return
	}
	name, ok := categoryName(c)
	if !ok {
		return
	}
	h.done(c, h.store.Create(c.Request.Context(), c.Param("id"), name))
}
func (h *Handler) rename(c *gin.Context) {
	if _, _, ok := h.authorize(c, permission.ManageChannels); !ok {
		return
	}
	name, ok := categoryName(c)
	if !ok {
		return
	}
	h.done(c, h.store.Rename(c.Request.Context(), c.Param("id"), c.Param("categoryId"), name))
}
func (h *Handler) delete(c *gin.Context) {
	if _, _, ok := h.authorize(c, permission.ManageChannels); !ok {
		return
	}
	h.done(c, h.store.Delete(c.Request.Context(), c.Param("id"), c.Param("categoryId")))
}
func (h *Handler) moveCategory(c *gin.Context) {
	if _, _, ok := h.authorize(c, permission.ManageChannels); !ok {
		return
	}
	var input struct {
		Direction string `json:"direction"`
	}
	if c.ShouldBindJSON(&input) != nil || (input.Direction != "up" && input.Direction != "down") {
		c.AbortWithStatus(400)
		return
	}
	h.done(c, h.store.MoveCategory(c.Request.Context(), c.Param("id"), c.Param("categoryId"), input.Direction))
}
func (h *Handler) moveChannel(c *gin.Context) {
	snap, user, ok := h.authorize(c, permission.ManageChannels)
	if !ok {
		return
	}
	channel := c.Param("channelId")
	if !snap.CanView(channel, user) {
		c.AbortWithStatus(404)
		return
	}
	var input struct {
		CategoryID *string `json:"category_id"`
		BeforeID   *string `json:"before_id"`
	}
	if c.ShouldBindJSON(&input) != nil {
		c.AbortWithStatus(400)
		return
	}
	if input.BeforeID != nil && !snap.CanView(*input.BeforeID, user) {
		c.AbortWithStatus(404)
		return
	}
	h.done(c, h.store.MoveChannel(c.Request.Context(), c.Param("id"), channel, input.CategoryID, input.BeforeID))
}
