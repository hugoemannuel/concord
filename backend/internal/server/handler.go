package server

import (
	"context"
	"net/http"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/friendship"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// PermissionChecker: o membro tem os bits no servidor (permission.Service).
type PermissionChecker interface {
	Require(ctx context.Context, serverID, userID string, want int64) error
}

// RoleLister: cargos do servidor para a resposta de GET /servers/:id.
type RoleLister interface {
	List(ctx context.Context, serverID, userID string) ([]permission.Role, error)
}

// ImageUploader recebe o ícone do servidor (o mesmo upload do avatar).
type ImageUploader interface {
	UploadImage(c *gin.Context, apply user.ImageApply)
	RemoveMediaURL(url *string)
}

// IconSetter grava o ícone novo (nil tira), avisa os membros e devolve o
// ícone antigo para apagar o arquivo.
type IconSetter interface {
	SetIcon(ctx context.Context, serverID string, url *string) (*Server, *string, error)
}

type Handler struct {
	images         ImageUploader
	icons          IconSetter
	settings       ServerSettings
	codes          InviteCodeRotator
	audit          AuditRecorder
	service        *Service
	friendService  *friendship.Service
	userService    *user.Service
	channelService *channel.Service
	perms          PermissionChecker
	roles          RoleLister
	moderation     *Moderation
	nicknames      *Nicknames
	previews       InvitePreviewer
}

func ServerHandler(service *Service, friendService *friendship.Service, userService *user.Service, channelService *channel.Service, perms PermissionChecker, roles RoleLister, moderation *Moderation, nicknames *Nicknames, images ImageUploader) *Handler {
	return &Handler{
		images:         images,
		icons:          service,
		settings:       service,
		codes:          service,
		service:        service,
		friendService:  friendService,
		userService:    userService,
		channelService: channelService,
		perms:          perms,
		roles:          roles,
		moderation:     moderation,
		nicknames:      nicknames,
		previews:       service,
	}
}

// respondPermission responde os erros de permissão (true se respondeu).
func respondPermission(c *gin.Context, err error) bool {
	if status, code, ok := permission.HTTPError(err); ok {
		c.JSON(status, gin.H{"error": err.Error(), "code": code})
		return true
	}
	return false
}

func (h *Handler) Create(c *gin.Context) {
	var input struct {
		Name    string `json:"name"`
		IconURL string `json:"icon_url"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "invalid request",
		})
		return
	}

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "unauthorized",
		})
		return
	}

	server := &Server{
		Name:    input.Name,
		OwnerID: userID.(string),
		IconURL: input.IconURL,
	}

	if err := h.service.Create(c.Request.Context(), server); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	defaultChannel := &channel.Channel{
		ServerID:  server.ID,
		Name:      "geral",
		CreatedBy: userID.(string),
	}
	if err := h.channelService.Create(c.Request.Context(), defaultChannel); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create default channel"})
		return
	}
	if _, err := h.channelService.CreateNotices(c.Request.Context(), server.ID, userID.(string)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create notices channel"})
		return
	}
	if _, err := h.channelService.CreateSystem(c.Request.Context(), server.ID, userID.(string)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create bot channel"})
		return
	}

	h.service.NotifyMemberJoined(c.Request.Context(), server.ID, userID.(string))

	c.JSON(http.StatusCreated, server)
}

func (h *Handler) Delete(c *gin.Context) {
	serverID := c.Param("id")

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	srv, err := h.service.FindByID(c.Request.Context(), serverID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}

	if srv.OwnerID != userID.(string) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the owner can delete the server"})
		return
	}

	if err := h.service.Delete(c.Request.Context(), serverID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete server"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "server deleted"})
}

func (h *Handler) ListByUser(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	servers, err := h.service.ListByUserID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list servers"})
		return
	}

	c.JSON(http.StatusOK, servers)
}

func (h *Handler) GetByID(c *gin.Context) {
	serverID := c.Param("id")

	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	isMember, err := h.service.IsMember(c.Request.Context(), serverID, userID.(string))
	if err != nil || !isMember {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not a member of this server"})
		return
	}

	server, err := h.service.FindByID(c.Request.Context(), serverID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}

	members, err := h.service.ListMembers(c.Request.Context(), serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list members"})
		return
	}

	roles, err := h.roles.List(c.Request.Context(), serverID, userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list roles"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"server":  server,
		"members": members,
		"roles":   roles,
	})
}
