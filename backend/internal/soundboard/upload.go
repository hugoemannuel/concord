package soundboard

import (
	"context"
	"errors"
	"gin-quickstart/backend/internal/audit"
	"log"
	"net/http"
	"strconv"
	"strings"
	"syscall"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const multipartOverhead = 256 << 10 // 256 KB para cabeçalhos e campos de texto

// maxFieldBytes: limite de cada campo de texto do upload (nome, emoji, duração).
const maxFieldBytes = 256

func (h *Handler) Upload(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	sound := &Sound{ID: uuid.NewString(), ServerID: c.Param("id"), UploaderID: userID.(string)}
	if e := h.receiveSound(c, sound); e != nil {
		c.JSON(e.status, e.body)
		return
	}
	if h.publisher != nil {
		h.publisher.BroadcastToRoom("server:"+sound.ServerID, marshalEvent("soundboard:created", CreatedEvent{
			ServerID: sound.ServerID,
			Sound:    *sound,
		}))
	}
	h.record(c.Request.Context(), audit.SoundCreate, sound.UploaderID, sound.ServerID, sound.ID, sound.Name)
	c.JSON(http.StatusCreated, sound)
}

// receiveSound confere quem envia e o corpo, salva o arquivo e grava o som.
func (h *Handler) receiveSound(c *gin.Context, sound *Sound) *apiErr {
	ctx := c.Request.Context()
	if e := h.checkUploader(ctx, sound.ServerID, sound.UploaderID); e != nil {
		return e
	}
	if e := h.checkBody(c); e != nil {
		return e
	}
	form, e := h.readSoundForm(c, sound.ID)
	if e != nil {
		return e
	}
	if e := fillSound(sound, form); e != nil {
		h.removeFile(sound.ID)
		return e
	}
	if err := h.repo.Create(ctx, sound); err != nil {
		log.Printf("failed to save soundboard item %s: %v", sound.ID, err)
		h.removeFile(sound.ID)
		return fail(http.StatusInternalServerError, "failed to save sound")
	}
	return nil
}

func (h *Handler) checkUploader(ctx context.Context, serverID, userID string) *apiErr {
	isMember, err := h.servers.IsMember(ctx, serverID, userID)
	if err != nil {
		return fail(http.StatusInternalServerError, "failed to check membership")
	}
	if !isMember {
		return fail(http.StatusForbidden, ErrNotServerMember.Error())
	}
	perms, err := h.permissions.ServerPerms(ctx, serverID, userID)
	if err != nil {
		return fail(http.StatusInternalServerError, "failed to check permissions")
	}
	if !permission.Has(perms, permission.AddSounds) {
		return &apiErr{status: http.StatusForbidden, body: gin.H{
			"error": ErrCannotAddSound.Error(), "code": "missing_permission",
		}}
	}
	return h.checkServerRoom(ctx, serverID)
}

func (h *Handler) checkServerRoom(ctx context.Context, serverID string) *apiErr {
	count, err := h.repo.CountByServer(ctx, serverID)
	if err != nil {
		return fail(http.StatusInternalServerError, "failed to check server soundboard limit")
	}
	if count >= h.maxPerServer {
		return fail(http.StatusConflict, ErrServerFull.Error())
	}
	return nil
}

// checkBody recusa corpo grande demais ou sem espaço em disco e limita a leitura.
func (h *Handler) checkBody(c *gin.Context) *apiErr {
	incoming := c.Request.ContentLength
	if incoming < 0 {
		incoming = h.maxSoundBytes
	}
	if !h.space.HasRoom(incoming) {
		return fail(http.StatusInsufficientStorage, "server out of space")
	}
	if c.Request.ContentLength > h.maxSoundBytes+multipartOverhead {
		return fail(http.StatusRequestEntityTooLarge, "file too large (max 5 MB)")
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, h.maxSoundBytes+multipartOverhead)
	return nil
}

func (h *Handler) readSoundForm(c *gin.Context, id string) (media.Form, *apiErr) {
	reader, err := c.Request.MultipartReader()
	if err != nil {
		return media.Form{}, fail(http.StatusBadRequest, "invalid upload")
	}
	form, err := h.store.ReadForm(reader, media.FormSpec{
		ID:       id,
		MaxFile:  h.maxSoundBytes,
		MaxField: maxFieldBytes,
		Fields:   []string{"name", "emoji", "duration_ms"},
	})
	if err != nil {
		return media.Form{}, fail(formErrorStatus(err))
	}
	return form, nil
}

func formErrorStatus(err error) (int, string) {
	switch {
	case errors.Is(err, media.ErrMissingFile):
		return http.StatusBadRequest, "audio file is required"
	case errors.Is(err, media.ErrTooLarge):
		return http.StatusRequestEntityTooLarge, "file too large (max 5 MB)"
	case errors.Is(err, syscall.ENOSPC):
		return http.StatusInsufficientStorage, "server out of space"
	default:
		return http.StatusBadRequest, "invalid upload"
	}
}

// fillSound valida os campos e o tipo do arquivo e preenche o som.
func fillSound(sound *Sound, form media.Form) *apiErr {
	name, err := sanitizeName(form.Fields["name"])
	if err != nil {
		return fail(http.StatusBadRequest, err.Error())
	}
	dur, err := strconv.Atoi(strings.TrimSpace(form.Fields["duration_ms"]))
	if err != nil || dur < MinSoundDurationMs || dur > MaxSoundDurationMs {
		return fail(http.StatusBadRequest, ErrInvalidDuration.Error())
	}
	kind, contentType, ok := media.Sniff(form.Head, form.Declared)
	if !ok || kind != media.KindAudio {
		return fail(http.StatusUnsupportedMediaType, "only audio files (mp3, wav, ogg, m4a, webm) are allowed")
	}
	sound.Name = name
	sound.Emoji = sanitizeEmoji(form.Fields["emoji"])
	sound.DurationMs = dur
	sound.ContentType = contentType
	sound.SizeBytes = form.Size
	return nil
}

func (h *Handler) removeFile(id string) {
	if err := h.store.Remove(id); err != nil {
		log.Printf("failed to remove rejected soundboard upload %s: %v", id, err)
	}
}
