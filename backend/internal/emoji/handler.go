package emoji

import (
	"context"
	"errors"
	"gin-quickstart/backend/internal/audit"
	"log"
	"mime"
	"net/http"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
)

type emojiRepo interface {
	Create(ctx context.Context, e *Emoji) error
	ListForUser(ctx context.Context, userID string) ([]ServerEmojis, error)
	FindByID(ctx context.Context, id string) (*Emoji, error)
	CountByServer(ctx context.Context, serverID string) (int, error)
	Delete(ctx context.Context, id string) error
}

type serverChecker interface {
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
}

type permissionChecker interface {
	ServerPerms(ctx context.Context, serverID, userID string) (int64, error)
}

type spaceChecker interface {
	HasRoom(incoming int64) bool
}

type mediaTokens interface {
	VerifyMediaToken(token string) (userID string, err error)
}

type eventPublisher interface {
	BroadcastToRoom(room string, event []byte)
}

type Handler struct {
	repo        emojiRepo
	store       *media.Store
	space       spaceChecker
	servers     serverChecker
	permissions permissionChecker
	tokens      mediaTokens
	publisher   eventPublisher
	audit       AuditRecorder
}

func NewHandler(
	repo emojiRepo,
	store *media.Store,
	space spaceChecker,
	servers serverChecker,
	permissions permissionChecker,
	tokens mediaTokens,
	publisher eventPublisher,
) *Handler {
	return &Handler{
		repo:        repo,
		store:       store,
		space:       space,
		servers:     servers,
		permissions: permissions,
		tokens:      tokens,
		publisher:   publisher,
	}
}

// ListMine: os emojis de todos os servidores de quem pede (uma consulta).
func (h *Handler) ListMine(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	groups, err := h.repo.ListForUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list emojis"})
		return
	}
	c.JSON(http.StatusOK, groups)
}

func (h *Handler) Delete(c *gin.Context) {
	actorID := c.GetString("userID")
	if actorID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	serverID := c.Param("id")
	e, status, err := h.deletable(c.Request.Context(), serverID, c.Param("emojiId"), actorID)
	if err != nil {
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.Delete(c.Request.Context(), e.ID); err != nil {
		c.JSON(deleteErrorStatus(err), gin.H{"error": err.Error()})
		return
	}
	if err := h.store.Remove(e.ID); err != nil {
		log.Printf("failed to remove emoji file %s: %v", e.ID, err)
	}
	h.broadcast(serverID, "emoji:deleted", DeletedEvent{ServerID: serverID, EmojiID: e.ID})
	h.record(c.Request.Context(), audit.EmojiDelete, actorID, serverID, e.ID, e.Name)
	c.JSON(http.StatusOK, gin.H{"message": "emoji deleted"})
}

// deletable: o emoji do servidor, se quem pede o enviou ou modera expressões.
func (h *Handler) deletable(ctx context.Context, serverID, emojiID, actorID string) (*Emoji, int, error) {
	e, err := h.repo.FindByID(ctx, emojiID)
	if errors.Is(err, ErrEmojiNotFound) || (err == nil && e.ServerID != serverID) {
		return nil, http.StatusNotFound, ErrEmojiNotFound
	}
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("failed to load emoji")
	}
	if e.UploaderID == actorID {
		return e, 0, nil
	}
	perms, err := h.permissions.ServerPerms(ctx, serverID, actorID)
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("failed to check permissions")
	}
	if !permission.Has(perms, permission.ManageExpressions) {
		return nil, http.StatusForbidden, ErrCannotDeleteEmoji
	}
	return e, 0, nil
}

func deleteErrorStatus(err error) int {
	if errors.Is(err, ErrEmojiNotFound) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}

func (h *Handler) broadcast(serverID, typ string, payload any) {
	if h.publisher != nil {
		h.publisher.BroadcastToRoom("server:"+serverID, marshalEvent(typ, payload))
	}
}

// ServeFile entrega a imagem só a membros do servidor do emoji. O arquivo de
// um id nunca muda, então o navegador guarda para sempre (immutable).
func (h *Handler) ServeFile(c *gin.Context) {
	userID, err := h.tokens.VerifyMediaToken(c.Query("token"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid media token"})
		return
	}
	e, status := h.visibleEmoji(c.Request.Context(), c.Param("emojiId"), userID)
	if e == nil {
		c.JSON(status, gin.H{"error": ErrEmojiNotFound.Error()})
		return
	}
	file, err := h.store.Open(e.ID)
	if err != nil {
		log.Printf("emoji %s has no file: %v", e.ID, err)
		c.JSON(http.StatusNotFound, gin.H{"error": ErrEmojiNotFound.Error()})
		return
	}
	defer file.Close()

	header := c.Writer.Header()
	header.Set("Content-Type", e.ContentType)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Cache-Control", "private, max-age=31536000, immutable")
	header.Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": e.Name}))
	http.ServeContent(c.Writer, c.Request, "", e.CreatedAt, file)
}

// visibleEmoji: o emoji, se quem pede é membro do servidor dele; senão nil e
// o status (404 também para quem não é membro, para não revelar que existe).
func (h *Handler) visibleEmoji(ctx context.Context, emojiID, userID string) (*Emoji, int) {
	e, err := h.repo.FindByID(ctx, emojiID)
	if errors.Is(err, ErrEmojiNotFound) {
		return nil, http.StatusNotFound
	}
	if err != nil {
		return nil, http.StatusInternalServerError
	}
	isMember, err := h.servers.IsMember(ctx, e.ServerID, userID)
	if err != nil {
		return nil, http.StatusInternalServerError
	}
	if !isMember {
		return nil, http.StatusNotFound
	}
	return e, 0
}
