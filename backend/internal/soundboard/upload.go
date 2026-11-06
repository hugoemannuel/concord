package soundboard

import (
	"context"
	"gin-quickstart/backend/internal/audit"
	"log"
	"net/http"
	"strconv"
	"strings"

	"gin-quickstart/backend/internal/expression"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/platform/media"
	"gin-quickstart/backend/internal/platform/wsevent"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const multipartOverhead = 256 << 10 // 256 KB para cabeçalhos e campos de texto

// maxFieldBytes: limite de cada campo de texto do upload (nome, emoji, duração).
const maxFieldBytes = 256

func (h *Handler) Upload(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	sound := &Sound{ID: uuid.NewString(), ServerID: c.Param("id"), UploaderID: userID}
	if e := h.receiveSound(c, sound); e != nil {
		c.JSON(e.status, e.body)
		return
	}
	if h.publisher != nil {
		h.publisher.BroadcastToRoom("server:"+sound.ServerID, wsevent.Marshal("soundboard:created", CreatedEvent{
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
	return expression.CheckUploader(ctx, expression.Uploader{
		Members: h.servers, Perms: h.permissions, Counter: h.repo,
		Permission: permission.AddSounds, Max: h.maxPerServer,
	}, serverID, userID, uploaderErrors)
}

// uploaderErrors: a resposta de cada recusa de quem envia.
var uploaderErrors = expression.UploaderErrors[*apiErr]{
	MemberCheck: fail(http.StatusInternalServerError, "failed to check membership"),
	NotMember:   fail(http.StatusForbidden, ErrNotServerMember.Error()),
	PermsCheck:  fail(http.StatusInternalServerError, "failed to check permissions"),
	MissingPermission: &apiErr{status: http.StatusForbidden, body: gin.H{
		"error": ErrCannotAddSound.Error(), "code": "missing_permission",
	}},
	CountCheck: fail(http.StatusInternalServerError, "failed to check server soundboard limit"),
	Full:       fail(http.StatusConflict, ErrServerFull.Error()),
}

// readSoundForm confere o corpo (espaço em disco e tamanho), limita a
// leitura e lê o upload.
func (h *Handler) readSoundForm(c *gin.Context, id string) (media.Form, *apiErr) {
	reader, err := media.OpenUpload(c.Writer, c.Request, h.space, media.UploadSpec{
		Limit: h.maxSoundBytes + multipartOverhead,
		Room:  h.maxSoundBytes,
		Cap:   true,
	})
	if err != nil {
		return media.Form{}, formError(err)
	}
	form, err := h.store.ReadForm(reader, media.FormSpec{
		ID:       id,
		MaxFile:  h.maxSoundBytes,
		MaxField: maxFieldBytes,
		Fields:   []string{"name", "emoji", "duration_ms"},
	})
	if err != nil {
		return media.Form{}, formError(err)
	}
	return form, nil
}

// formErrors: a resposta de cada recusa do upload; o resto também é 400.
var formErrors = media.UploadErrors[*apiErr]{
	MissingFile:  fail(http.StatusBadRequest, "audio file is required"),
	BadForm:      errInvalidUpload,
	NotMultipart: errInvalidUpload,
	TooLarge:     fail(http.StatusRequestEntityTooLarge, "file too large (max 5 MB)"),
	NoSpace:      fail(http.StatusInsufficientStorage, "server out of space"),
}

var errInvalidUpload = fail(http.StatusBadRequest, "invalid upload")

func formError(err error) *apiErr {
	if e, ok := formErrors.For(err); ok {
		return e
	}
	return errInvalidUpload
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
