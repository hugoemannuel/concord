package channelcategory

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

type Permissions interface {
	Snapshot(context.Context, string) (*permission.Snapshot, error)
}

// Publisher avisa os outros clientes. PublishPermissionsChanged é para quando muda
// quem vê o quê: quem perdeu o acesso sai das salas e das chamadas.
type Publisher interface {
	PublishCategoryChanged(string)
	PublishPermissionsChanged(string)
}

// PermissionCache esquece o snapshot do servidor (o cache não tem TTL: quem escreve avisa).
type PermissionCache interface{ InvalidateServer(string) }

type Handler struct {
	store     Store
	perms     Permissions
	publisher Publisher
	audit     AuditRecorder
	cache     PermissionCache
}

func NewHandler(store Store, perms Permissions, publisher Publisher) *Handler {
	return &Handler{store: store, perms: perms, publisher: publisher}
}

// SetPermissionCache liga a invalidação do cache de permissões (no boot).
func (h *Handler) SetPermissionCache(cache PermissionCache) { h.cache = cache }

func Routes(api *gin.RouterGroup, h *Handler, auth gin.HandlerFunc) {
	g := api.Group("/servers/:id/categories", auth)
	g.GET("", h.list)
	g.POST("", h.create)
	g.PUT("/layout", h.saveLayout)
	g.PUT("/:categoryId", h.update)
	g.DELETE("/:categoryId", h.delete)
	g.PUT("/:categoryId/order", h.moveCategory)
	g.PUT("/:categoryId/overwrites/:type/:targetId", h.setOverwrite)
	g.DELETE("/:categoryId/overwrites/:type/:targetId", h.deleteOverwrite)
	g.PUT("/channels/:channelId", h.moveChannel)
	g.POST("/channels/:channelId/sync", h.syncChannel)
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

func viewerOf(snap *permission.Snapshot, user string) Viewer {
	return Viewer{
		Channel:  func(channel string) bool { return snap.CanView(channel, user) },
		Category: func(category string) bool { return snap.CanViewCategory(category, user) },
	}
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
	layout = visibleLayout(layout, viewerOf(snap, user))
	layout.Revision = layoutRevision(layout)
	c.JSON(http.StatusOK, withPermissions(layout, snap))
}

// withPermissions acrescenta as regras de cada categoria e se o canal está vinculado.
func withPermissions(layout Layout, snap *permission.Snapshot) Layout {
	for i, category := range layout.Categories {
		layout.Categories[i].Overwrites = append([]permission.Overwrite{}, snap.Categories[category.ID].Overwrites...)
	}
	for i, placement := range layout.Channels {
		if placement.CategoryID != nil {
			own, rules := snap.Channels[placement.ChannelID].Overwrites, snap.Categories[*placement.CategoryID].Overwrites
			layout.Channels[i].Synced = placement.Fixed || permission.SameOverwrites(own, rules)
		}
	}
	return layout
}

func validName(raw string) (string, bool) {
	name := strings.TrimSpace(raw)
	return name, name != "" && utf8.RuneCountInString(name) <= 100
}

// categoryInput: o corpo de criar e editar. Private nil (apps antigos, ou só renomear)
// não mexe nas permissões.
type categoryInput struct {
	Name      string   `json:"name"`
	Private   *bool    `json:"private"`
	RoleIDs   []string `json:"role_ids"`
	MemberIDs []string `json:"member_ids"`
}

func (in categoryInput) privacy() PrivacyInput {
	return PrivacyInput{Private: in.Private != nil && *in.Private, RoleIDs: in.RoleIDs, MemberIDs: in.MemberIDs}
}

func bindCategory(c *gin.Context) (categoryInput, bool) {
	var input categoryInput
	if c.ShouldBindJSON(&input) != nil {
		c.AbortWithStatus(400)
		return input, false
	}
	name, ok := validName(input.Name)
	if !ok {
		c.AbortWithStatus(400)
		return input, false
	}
	input.Name = name
	return input, true
}

// visibleCategory: a categoria existe para este membro (quem não a vê recebe 404, como
// se ela não existisse: nem o id denuncia).
func (h *Handler) visibleCategory(c *gin.Context, want int64) (*permission.Snapshot, string, bool) {
	snap, user, ok := h.authorize(c, want)
	if !ok {
		return nil, "", false
	}
	if !snap.CanViewCategory(c.Param("categoryId"), user) {
		c.AbortWithStatus(404)
		return nil, "", false
	}
	return snap, user, true
}

// respondError traduz o erro do domínio e diz se respondeu. Sem erro, quem chamou segue.
func respondError(c *gin.Context, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, pgx.ErrNoRows):
		c.AbortWithStatus(404)
	case errors.Is(err, ErrInvalidTarget):
		c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": err.Error(), "code": "invalid_target"})
	case errors.Is(err, ErrInvalidOverwrite):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "invalid"})
	case errors.Is(err, ErrCannotGrant):
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "cannot_grant"})
	case errors.Is(err, ErrFixedChannel), errors.Is(err, ErrNoCategory):
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "cannot_sync"})
	default:
		c.AbortWithStatus(500)
	}
	return true
}

// changed: a organização mudou. A ordem importa: o snapshot é esquecido antes de os
// clientes serem avisados, para o aviso já valer com as regras novas.
func (h *Handler) changed(server string, permissions bool) {
	if h.cache != nil {
		h.cache.InvalidateServer(server)
	}
	if h.publisher == nil {
		return
	}
	if permissions {
		h.publisher.PublishPermissionsChanged(server)
	}
	h.publisher.PublishCategoryChanged(server)
}

func (h *Handler) create(c *gin.Context) {
	snap, user, ok := h.authorize(c, permission.ManageChannels)
	if !ok {
		return
	}
	input, ok := bindCategory(c)
	if !ok {
		return
	}
	privacy := input.privacy()
	var overwrites []permission.Overwrite
	if privacy.Private {
		if respondError(c, privacy.validate(snap)) {
			return
		}
		overwrites = privacyOverwrites(snap, user, privacy, nil)
	}
	category, err := h.store.Create(c.Request.Context(), c.Param("id"), input.Name, overwrites)
	if respondError(c, err) {
		return
	}
	h.changed(c.Param("id"), false)
	h.record(c.Request.Context(), createdEvent(c.Param("id"), user, category, privacy.Private))
	c.Status(http.StatusNoContent)
}

// update renomeia e, se veio "private", troca quem vê. Trocar quem vê mexe nas
// permissões de todos os canais vinculados: exige também MANAGE_ROLES.
func (h *Handler) update(c *gin.Context) {
	input, ok := bindCategory(c)
	if !ok {
		return
	}
	want := permission.ManageChannels
	if input.Private != nil {
		want |= permission.ManageRoles
	}
	snap, user, ok := h.visibleCategory(c, want)
	if !ok {
		return
	}
	update := CategoryUpdate{Name: input.Name}
	if input.Private != nil {
		privacy := input.privacy()
		if respondError(c, privacy.validate(snap)) {
			return
		}
		update.Overwrites = func(current []permission.Overwrite) ([]permission.Overwrite, error) {
			next := privacyOverwrites(snap, user, privacy, current)
			return next, checkGrant(snap, user, current, next)
		}
	}
	change, err := h.store.Update(c.Request.Context(), c.Param("id"), c.Param("categoryId"), update)
	if respondError(c, err) {
		return
	}
	h.changed(c.Param("id"), input.Private != nil)
	h.recordUpdate(c.Request.Context(), updatedEvent(c.Param("id"), user, snap.Everyone.ID, change))
	c.Status(http.StatusNoContent)
}

func checkGrant(snap *permission.Snapshot, user string, before, after []permission.Overwrite) error {
	if !permission.CanGrant(snap.Server(user), changedBits(before, after)) {
		return ErrCannotGrant
	}
	return nil
}

func (h *Handler) delete(c *gin.Context) {
	_, user, ok := h.visibleCategory(c, permission.ManageChannels)
	if !ok {
		return
	}
	category, err := h.store.Delete(c.Request.Context(), c.Param("id"), c.Param("categoryId"))
	if respondError(c, err) {
		return
	}
	h.changed(c.Param("id"), true)
	h.record(c.Request.Context(), categoryEvent(audit.CategoryDelete, c.Param("id"), user, category, nil))
	c.Status(http.StatusNoContent)
}

func (h *Handler) moveCategory(c *gin.Context) {
	_, user, ok := h.visibleCategory(c, permission.ManageChannels)
	if !ok {
		return
	}
	var input struct {
		Direction string `json:"direction"`
	}
	if c.ShouldBindJSON(&input) != nil || (input.Direction != "up" && input.Direction != "down") {
		c.AbortWithStatus(400)
		return
	}
	if respondError(c, h.store.MoveCategory(c.Request.Context(), c.Param("id"), c.Param("categoryId"), input.Direction)) {
		return
	}
	h.changed(c.Param("id"), false)
	h.record(c.Request.Context(), reorderedEvent(c.Param("id"), user))
	c.Status(http.StatusNoContent)
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
	if !canTarget(snap, user, input.CategoryID, input.BeforeID) {
		c.AbortWithStatus(404)
		return
	}
	if respondError(c, h.store.MoveChannel(c.Request.Context(), c.Param("id"), channel, input.CategoryID, input.BeforeID)) {
		return
	}
	h.changed(c.Param("id"), true)
	h.record(c.Request.Context(), reorderedEvent(c.Param("id"), user))
	c.Status(http.StatusNoContent)
}

// canTarget: o membro enxerga a categoria e o canal de destino. O que ele não vê não
// pode ser alvo (nem para descobrir se existe).
func canTarget(snap *permission.Snapshot, user string, category, before *string) bool {
	if category != nil {
		if _, known := snap.Categories[*category]; known && !snap.CanViewCategory(*category, user) {
			return false
		}
	}
	return before == nil || snap.CanView(*before, user)
}
