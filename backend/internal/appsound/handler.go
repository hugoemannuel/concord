package appsound

import (
	"context"
	"errors"
	"log"
	"net/http"
	"syscall"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
)

// Handler: GET/PUT das escolhas, POST/DELETE do áudio próprio de um evento e o
// arquivo público. O corpo do POST é o próprio arquivo (sem multipart).
type Handler struct {
	service  *Service
	files    *media.Store
	space    media.Room
	maxBytes int64 // MaxFileBytes; testes diminuem
}

func NewHandler(service *Service, files *media.Store, space media.Room) *Handler {
	return &Handler{service: service, files: files, space: space, maxBytes: MaxFileBytes}
}

func (h *Handler) fail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidSettings):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid app sound settings"})
	case errors.Is(err, ErrUnknownEvent):
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown sound event"})
	default:
		log.Printf("[appsound] %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
	}
}

// Get: GET /users/me/app-sounds
func (h *Handler) Get(c *gin.Context) {
	view, err := h.service.Get(c.Request.Context(), c.GetString("userID"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

// Save: PUT /users/me/app-sounds com as escolhas inteiras.
func (h *Handler) Save(c *gin.Context) {
	var in Settings
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	view, err := h.service.Save(c.Request.Context(), c.GetString("userID"), in)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

// Upload: POST /users/me/app-sounds/:event?duration_ms=N com o áudio no corpo.
func (h *Handler) Upload(c *gin.Context) {
	ctx, userID, event := c.Request.Context(), c.GetString("userID"), c.Param("event")
	if !ValidEvent(event) {
		h.fail(c, ErrUnknownEvent)
		return
	}
	durationMs, err := parseDuration(c.Query("duration_ms"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, err := media.SaveAudio(h.files, h.space, c.Request, h.maxBytes, acceptedType)
	if err != nil {
		status, msg := saveStatus(err)
		c.JSON(status, gin.H{"error": msg})
		return
	}
	old, err := h.service.SetFile(ctx, userID, event, id, durationMs)
	if err != nil {
		h.removeFile(id)
		h.fail(c, err)
		return
	}
	h.removeFile(old)
	h.respondView(c, ctx, userID)
}

// Delete: DELETE /users/me/app-sounds/:event (volta ao som do pacote).
func (h *Handler) Delete(c *gin.Context) {
	ctx, userID := c.Request.Context(), c.GetString("userID")
	old, err := h.service.RemoveFile(ctx, userID, c.Param("event"))
	if err != nil {
		h.fail(c, err)
		return
	}
	h.removeFile(old)
	h.respondView(c, ctx, userID)
}

func (h *Handler) respondView(c *gin.Context, ctx context.Context, userID string) {
	view, err := h.service.Get(ctx, userID)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

// Serve: GET /app-sounds/:id, sem token (ver media.ServeAudio).
func (h *Handler) Serve(c *gin.Context) {
	id, ok := parseFileID(c.Param("id"))
	if !ok || !media.ServeAudio(c.Writer, c.Request, h.files, id) {
		c.JSON(http.StatusNotFound, gin.H{"error": "sound not found"})
	}
}

func (h *Handler) removeFile(id string) {
	if id == "" {
		return
	}
	if err := h.files.Remove(id); err != nil {
		log.Printf("[appsound] não deu para apagar o áudio %s: %v", id, err)
	}
}

// saveStatus traduz o erro do upload (o app mostra a regra em português).
func saveStatus(err error) (int, string) {
	var maxBytes *http.MaxBytesError
	switch {
	case errors.Is(err, media.ErrNotAudio):
		return http.StatusUnsupportedMediaType, "only audio files (mp3, ogg, wav, m4a) are allowed"
	case errors.Is(err, media.ErrTooLarge), errors.As(err, &maxBytes):
		return http.StatusRequestEntityTooLarge, "file too large"
	case errors.Is(err, syscall.ENOSPC):
		return http.StatusInsufficientStorage, "server out of space"
	default:
		log.Printf("[appsound] upload: %v", err)
		return http.StatusInternalServerError, "internal error"
	}
}
