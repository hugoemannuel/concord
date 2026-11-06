package server

import (
	"context"
	"net/http"

	"gin-quickstart/backend/internal/channel"
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

// serverDesk: o que os handlers de servidor usam do Service.
type serverDesk interface {
	Create(ctx context.Context, server *Server) error
	NotifyMemberJoined(ctx context.Context, serverID, userID string)
	FindByID(ctx context.Context, id string) (*Server, error)
	Delete(ctx context.Context, id string) error
	ListByUserID(ctx context.Context, userID string) ([]Server, error)
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
	ListMembers(ctx context.Context, serverID string) ([]ServerMember, error)
}

// DefaultChannels cria os canais que todo servidor novo ganha (channel.Service).
type DefaultChannels interface {
	Create(ctx context.Context, ch *channel.Channel, overwrites ...permission.Overwrite) error
	CreateNotices(ctx context.Context, serverID, createdBy string) (*channel.Channel, error)
	CreateSystem(ctx context.Context, serverID, createdBy string) (*channel.Channel, error)
}

type Handler struct {
	images     ImageUploader
	icons      IconSetter
	settings   ServerSettings
	codes      InviteCodeRotator
	audit      AuditRecorder
	service    serverDesk
	invites    inviteDesk
	friends    FriendChecker
	channels   DefaultChannels
	perms      PermissionChecker
	roles      RoleLister
	moderation *Moderation
	nicknames  *Nicknames
	previews   InvitePreviewer
}

func ServerHandler(service *Service, friends FriendChecker, channels DefaultChannels, perms PermissionChecker, roles RoleLister, moderation *Moderation, nicknames *Nicknames, images ImageUploader) *Handler {
	return &Handler{
		images:     images,
		icons:      service,
		settings:   service,
		codes:      service,
		service:    service,
		invites:    service,
		friends:    friends,
		channels:   channels,
		perms:      perms,
		roles:      roles,
		moderation: moderation,
		nicknames:  nicknames,
		previews:   service,
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

// requireMember: só membro vê o servidor; se não é, já respondeu 403.
func (h *Handler) requireMember(c *gin.Context, serverID, userID string) bool {
	isMember, err := h.service.IsMember(c.Request.Context(), serverID, userID)
	if err != nil || !isMember {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not a member of this server"})
		return false
	}
	return true
}

func (h *Handler) Create(c *gin.Context) {
	var input struct {
		Name    string `json:"name"`
		IconURL string `json:"icon_url"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	server := &Server{Name: input.Name, OwnerID: userID, IconURL: input.IconURL}
	if err := h.service.Create(ctx, server); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msg := h.createDefaultChannels(ctx, server.ID, userID); msg != "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": msg})
		return
	}
	h.service.NotifyMemberJoined(ctx, server.ID, userID)
	c.JSON(http.StatusCreated, server)
}

// createDefaultChannels cria "geral", "avisos" e o canal do bot; devolve a
// mensagem de erro do primeiro que falhar, ou "".
func (h *Handler) createDefaultChannels(ctx context.Context, serverID, userID string) string {
	general := &channel.Channel{ServerID: serverID, Name: "geral", CreatedBy: userID}
	if err := h.channels.Create(ctx, general); err != nil {
		return "failed to create default channel"
	}
	if _, err := h.channels.CreateNotices(ctx, serverID, userID); err != nil {
		return "failed to create notices channel"
	}
	if _, err := h.channels.CreateSystem(ctx, serverID, userID); err != nil {
		return "failed to create bot channel"
	}
	return ""
}

func (h *Handler) Delete(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	ctx, serverID := c.Request.Context(), c.Param("id")
	srv, err := h.service.FindByID(ctx, serverID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}
	if srv.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the owner can delete the server"})
		return
	}
	if err := h.service.Delete(ctx, serverID); err != nil {
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
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	serverID := c.Param("id")
	if !h.requireMember(c, serverID, userID) {
		return
	}
	h.respondDetails(c, serverID, userID)
}

// respondDetails responde GET /servers/:id: o servidor, os membros e os cargos.
func (h *Handler) respondDetails(c *gin.Context, serverID, userID string) {
	ctx := c.Request.Context()
	server, err := h.service.FindByID(ctx, serverID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}
	members, err := h.service.ListMembers(ctx, serverID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list members"})
		return
	}
	roles, err := h.roles.List(ctx, serverID, userID)
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
