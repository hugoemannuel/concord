package soundboard

import (
	"context"
	"errors"
	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
	"log"
	"mime"
	"net/http"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
)

type soundRepo interface {
	Create(ctx context.Context, s *Sound) error
	ListByServer(ctx context.Context, serverID string) ([]Sound, error)
	FindByID(ctx context.Context, id string) (*Sound, error)
	CountByServer(ctx context.Context, serverID string) (int, error)
	Delete(ctx context.Context, id string) error
}

type serverChecker interface {
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
}

// permissionChecker devolve as permissões do membro no servidor
// (permission.Service).
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
	repo          soundRepo
	store         *media.Store
	space         spaceChecker
	servers       serverChecker
	permissions   permissionChecker
	tokens        mediaTokens
	publisher     eventPublisher
	visitors      visitorChecker
	maxSoundBytes int64
	maxPerServer  int
	audit         AuditRecorder
}

func NewHandler(
	repo soundRepo,
	store *media.Store,
	space spaceChecker,
	servers serverChecker,
	permissions permissionChecker,
	tokens mediaTokens,
	publisher eventPublisher,
) *Handler {
	return &Handler{
		repo:          repo,
		store:         store,
		space:         space,
		servers:       servers,
		permissions:   permissions,
		tokens:        tokens,
		publisher:     publisher,
		maxSoundBytes: MaxSoundBytes,
		maxPerServer:  MaxSoundsPerServer,
	}
}

func (h *Handler) Delete(c *gin.Context) {
	actorID := c.GetString("userID")
	if actorID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	serverID := c.Param("id")
	ctx := c.Request.Context()
	sound, status, err := h.deletable(ctx, serverID, c.Param("soundId"), actorID)
	if err != nil {
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.Delete(ctx, sound.ID); err != nil {
		status, msg := deleteError(err)
		c.JSON(status, gin.H{"error": msg})
		return
	}

	if err := h.store.Remove(sound.ID); err != nil {
		log.Printf("failed to remove sound file %s: %v", sound.ID, err)
	}

	if h.publisher != nil {
		h.publisher.BroadcastToRoom("server:"+serverID, marshalEvent("soundboard:deleted", DeletedEvent{
			ServerID: serverID,
			SoundID:  sound.ID,
		}))
	}

	h.record(ctx, audit.SoundDelete, actorID, sound.ServerID, sound.ID, sound.Name)
	c.JSON(http.StatusOK, gin.H{"message": "sound deleted"})
}

// deletable: o item do servidor, se quem pede o enviou ou modera expressões.
func (h *Handler) deletable(ctx context.Context, serverID, id, actorID string) (*Sound, int, error) {
	sound, err := h.repo.FindByID(ctx, id)
	if errors.Is(err, ErrSoundNotFound) || (sound != nil && sound.ServerID != serverID) {
		return nil, http.StatusNotFound, ErrSoundNotFound
	}
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("failed to load sound")
	}
	if sound.UploaderID == actorID {
		return sound, 0, nil
	}
	perms, err := h.permissions.ServerPerms(ctx, serverID, actorID)
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("failed to check permissions")
	}
	if !permission.Has(perms, permission.ManageExpressions) {
		return nil, http.StatusForbidden, ErrCannotDeleteSound
	}
	return sound, 0, nil
}

func deleteError(err error) (int, string) {
	if errors.Is(err, ErrSoundNotFound) {
		return http.StatusNotFound, ErrSoundNotFound.Error()
	}
	return http.StatusInternalServerError, "failed to delete sound"
}

// ServeFile entrega o arquivo do som (o <audio> manda o media token na URL).
func (h *Handler) ServeFile(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid media token"})
		return
	}
	// Qualquer pessoa logada: favorito de outro servidor tocado numa chamada é
	// ouvido por quem não é de lá, e o id (UUID) do som só chega a quem o vê
	// na mesa ou o ouve (docs/adr/0013-mesa-de-audio-por-servidor.md).
	if _, err := h.tokens.VerifyMediaToken(token); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid media token"})
		return
	}

	ctx := c.Request.Context()
	notFound := func() { c.JSON(http.StatusNotFound, gin.H{"error": "sound not found"}) }

	sound, err := h.repo.FindByID(ctx, c.Param("soundId"))
	if errors.Is(err, ErrSoundNotFound) {
		notFound()
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load sound"})
		return
	}

	file, err := h.store.Open(sound.ID)
	if err != nil {
		log.Printf("soundboard %s has no file: %v", sound.ID, err)
		notFound()
		return
	}
	defer file.Close()

	header := c.Writer.Header()
	header.Set("Content-Type", sound.ContentType)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Cache-Control", "private, max-age=86400")
	header.Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": sound.Name}))
	http.ServeContent(c.Writer, c.Request, "", sound.CreatedAt, file)
}
