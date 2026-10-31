package emoji

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"gin-quickstart/backend/internal/audit"
	"log"
	"net/http"
	"syscall"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// multipartOverhead: folga do corpo além do arquivo (campos e cabeçalhos).
const multipartOverhead = 16 << 10

// maxFieldBytes: limite do campo de texto do upload (nome).
const maxFieldBytes = 256

// uploadErr é a resposta de uma etapa do upload que recusou o pedido.
type uploadErr struct {
	status int
	err    error
}

func fail(status int, err error) *uploadErr {
	return &uploadErr{status: status, err: err}
}

func (h *Handler) Upload(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	e := &Emoji{ID: uuid.New().String(), ServerID: c.Param("id"), UploaderID: userID}
	if ue := h.receiveEmoji(c, e); ue != nil {
		c.JSON(ue.status, gin.H{"error": ue.err.Error()})
		return
	}
	h.broadcast(e.ServerID, "emoji:created", CreatedEvent{ServerID: e.ServerID, Emoji: *e})
	h.record(c.Request.Context(), audit.EmojiCreate, userID, e.ServerID, e.ID, e.Name)
	c.JSON(http.StatusCreated, e)
}

// receiveEmoji confere quem envia e o corpo, salva o arquivo e grava o emoji.
func (h *Handler) receiveEmoji(c *gin.Context, e *Emoji) *uploadErr {
	ctx := c.Request.Context()
	if ue := h.checkUploader(ctx, e.ServerID, e.UploaderID); ue != nil {
		return ue
	}
	if ue := h.checkBody(c); ue != nil {
		return ue
	}
	form, ue := h.readForm(c, e.ID)
	if ue != nil {
		return ue
	}
	if ue := fillEmoji(e, form); ue != nil {
		_ = h.store.Remove(e.ID)
		return ue
	}
	if err := h.repo.Create(ctx, e); err != nil {
		_ = h.store.Remove(e.ID)
		return createError(err)
	}
	return nil
}

func createError(err error) *uploadErr {
	if errors.Is(err, ErrNameTaken) || errors.Is(err, ErrServerFull) {
		return fail(http.StatusConflict, err)
	}
	log.Printf("emoji create record failed: %v", err)
	return fail(http.StatusInternalServerError, errors.New("failed to save emoji"))
}

func (h *Handler) checkUploader(ctx context.Context, serverID, userID string) *uploadErr {
	isMember, err := h.servers.IsMember(ctx, serverID, userID)
	if err != nil {
		return fail(http.StatusInternalServerError, errors.New("failed to check membership"))
	}
	if !isMember {
		return fail(http.StatusForbidden, ErrNotServerMember)
	}
	perms, err := h.permissions.ServerPerms(ctx, serverID, userID)
	if err != nil {
		return fail(http.StatusInternalServerError, errors.New("failed to check permissions"))
	}
	if !permission.Has(perms, permission.AddEmojis) {
		return fail(http.StatusForbidden, ErrCannotAddEmoji)
	}
	count, err := h.repo.CountByServer(ctx, serverID)
	if err != nil {
		return fail(http.StatusInternalServerError, errors.New("failed to check server emoji limit"))
	}
	if count >= MaxEmojisPerServer {
		return fail(http.StatusConflict, ErrServerFull)
	}
	return nil
}

// checkBody recusa corpo grande demais ou sem espaço em disco.
func (h *Handler) checkBody(c *gin.Context) *uploadErr {
	if c.Request.ContentLength > MaxEmojiBytes+multipartOverhead {
		return fail(http.StatusRequestEntityTooLarge, ErrTooLarge)
	}
	if !h.space.HasRoom(MaxEmojiBytes) {
		return fail(http.StatusInsufficientStorage, errors.New("server out of space"))
	}
	return nil
}

func (h *Handler) readForm(c *gin.Context, id string) (media.Form, *uploadErr) {
	reader, err := c.Request.MultipartReader()
	if err != nil {
		return media.Form{}, fail(http.StatusBadRequest, errors.New("multipart/form-data required"))
	}
	form, err := h.store.ReadForm(reader, media.FormSpec{
		ID:       id,
		MaxFile:  MaxEmojiBytes,
		MaxField: maxFieldBytes,
		Fields:   []string{"name"},
	})
	if err != nil {
		return media.Form{}, formError(err)
	}
	return form, nil
}

func formError(err error) *uploadErr {
	switch {
	case errors.Is(err, media.ErrMissingFile):
		return fail(http.StatusBadRequest, errors.New("image file is required"))
	case errors.Is(err, media.ErrBadForm):
		return fail(http.StatusBadRequest, errors.New("invalid multipart body"))
	case errors.Is(err, media.ErrTooLarge):
		return fail(http.StatusRequestEntityTooLarge, ErrTooLarge)
	case errors.Is(err, syscall.ENOSPC):
		return fail(http.StatusInsufficientStorage, errors.New("server out of space"))
	default:
		log.Printf("emoji save failed: %v", err)
		return fail(http.StatusInternalServerError, errors.New("failed to save file"))
	}
}

// fillEmoji valida o nome e o tipo da imagem e preenche o emoji.
func fillEmoji(e *Emoji, form media.Form) *uploadErr {
	name := form.Fields["name"]
	if !validName(name) {
		return fail(http.StatusBadRequest, ErrInvalidName)
	}
	contentType, ok := imageType(form)
	if !ok {
		return fail(http.StatusUnsupportedMediaType, ErrUnsupportedImage)
	}
	e.Name = name
	e.ContentType = contentType
	e.SizeBytes = form.Size
	return nil
}

// imageType: PNG, JPEG, WEBP, GIF (pelo media.Sniff) ou AVIF, que o Sniff
// não conhece.
func imageType(form media.Form) (string, bool) {
	if isAVIF(form.Head) {
		return "image/avif", true
	}
	kind, contentType, ok := media.Sniff(form.Head, form.Declared)
	if !ok || kind != media.KindImage {
		return "", false
	}
	return contentType, true
}

// isAVIF: caixa "ftyp" no byte 4 com "avif" (estático) ou "avis" (animado)
// na marca principal ou nas compatíveis (ex.: "mif1" + "avif").
func isAVIF(head []byte) bool {
	if len(head) < 16 || !bytes.Equal(head[4:8], []byte("ftyp")) {
		return false
	}
	size := min(int(binary.BigEndian.Uint32(head[0:4])), len(head))
	for i := 8; i+4 <= size; i += 4 {
		if i == 12 {
			continue // versão da marca, não é marca
		}
		if brand := string(head[i : i+4]); brand == "avif" || brand == "avis" {
			return true
		}
	}
	return false
}
