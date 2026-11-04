package serverprofile

import (
	"context"
	"errors"
	"log"
	"net/http"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Cards é o que as rotas do perfil usam do serviço.
type Cards interface {
	Card(ctx context.Context, serverID, viewerID, inviteCode string) (*Card, error)
	CardByInvite(ctx context.Context, code, viewerID string) (*Card, error)
	Update(ctx context.Context, serverID, actorID string, patch Patch) (*Card, error)
}

// PermissionChecker confere as permissões do servidor (permission.Service).
type PermissionChecker interface {
	Require(ctx context.Context, serverID, userID string, want int64) error
}

// MemberGamesReader lê "Seus membros jogam" (Repository).
type MemberGamesReader interface {
	MemberGames(ctx context.Context, serverID string, limit int) ([]Game, error)
}

// Handler traduz HTTP para o perfil do servidor.
type Handler struct {
	cards Cards
	perms PermissionChecker
	games MemberGamesReader
}

func NewHandler(cards Cards, perms PermissionChecker, games MemberGamesReader) *Handler {
	return &Handler{cards: cards, perms: perms, games: games}
}

func validID(id string) bool {
	return uuid.Validate(id) == nil
}

func internalError(c *gin.Context, where string, err error) {
	log.Printf("[serverprofile] %s: %v", where, err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
}

// requireManage confere MANAGE_SERVER (false se já respondeu).
func (h *Handler) requireManage(c *gin.Context) bool {
	serverID := c.Param("id")
	if !validID(serverID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return false
	}
	err := h.perms.Require(c.Request.Context(), serverID, c.GetString("userID"), permission.ManageServer)
	if err == nil {
		return true
	}
	if status, code, ok := permission.HTTPError(err); ok {
		c.JSON(status, gin.H{"error": err.Error(), "code": code})
		return false
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
	return false
}

// GetCard: GET /servers/:id/card[?invite=código]. O perfil privado volta só com
// locked para quem não pode ver.
func (h *Handler) GetCard(c *gin.Context) {
	serverID := c.Param("id")
	if !validID(serverID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}
	card, err := h.cards.Card(c.Request.Context(), serverID, c.GetString("userID"), c.Query("invite"))
	if err != nil {
		internalError(c, "card", err)
		return
	}
	c.JSON(http.StatusOK, card)
}

// GetInviteCard: GET /invites/:id/card, o cartão da prévia do link (público).
func (h *Handler) GetInviteCard(c *gin.Context) {
	card, err := h.cards.CardByInvite(c.Request.Context(), c.Param("id"), c.GetString("userID"))
	if errors.Is(err, ErrInvalidInvite) {
		c.JSON(http.StatusNotFound, gin.H{"error": "convite inválido ou expirado"})
		return
	}
	if err != nil {
		internalError(c, "invite card", err)
		return
	}
	c.JSON(http.StatusOK, card)
}

// UpdateProfile: PUT /servers/:id/profile, só o que veio muda.
func (h *Handler) UpdateProfile(c *gin.Context) {
	if !h.requireManage(c) {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxPatchBodyBytes)
	var patch Patch
	if err := c.ShouldBindJSON(&patch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	card, err := h.cards.Update(c.Request.Context(), c.Param("id"), c.GetString("userID"), patch)
	if errors.Is(err, ErrInvalidProfile) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		internalError(c, "update", err)
		return
	}
	c.JSON(http.StatusOK, card)
}

// GetMemberGames: GET /servers/:id/profile/member-games, só para quem edita.
func (h *Handler) GetMemberGames(c *gin.Context) {
	if !h.requireManage(c) {
		return
	}
	games, err := h.games.MemberGames(c.Request.Context(), c.Param("id"), MemberGamesShown)
	if err != nil {
		internalError(c, "member games", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"games": games})
}
