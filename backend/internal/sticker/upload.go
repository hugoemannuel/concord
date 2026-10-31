package sticker

import (
	"context"
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

const multipartOverhead = 256 << 10

// maxFieldBytes: limite do campo de texto do upload (nome).
const maxFieldBytes = 1024

// uploadErr é a resposta de uma etapa do upload que recusou o pedido.
type uploadErr struct {
	status int
	body   gin.H
}

func fail(status int, msg string) *uploadErr {
	return &uploadErr{status: status, body: gin.H{"error": msg}}
}

func (h *Handler) Upload(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	sticker := &Sticker{ID: uuid.New().String(), ServerID: c.Param("id"), UploaderID: userID.(string)}
	if e := h.receiveSticker(c, sticker); e != nil {
		c.JSON(e.status, e.body)
		return
	}
	if h.publisher != nil {
		h.publisher.BroadcastToRoom("server:"+sticker.ServerID, marshalEvent("sticker:created", CreatedEvent{
			ServerID: sticker.ServerID,
			Sticker:  *sticker,
		}))
	}
	h.record(c.Request.Context(), audit.StickerCreate, sticker.UploaderID, sticker.ServerID, sticker.ID, sticker.Name)
	c.JSON(http.StatusCreated, sticker)
}

// receiveSticker confere quem envia e o corpo, salva o arquivo e grava a figurinha.
func (h *Handler) receiveSticker(c *gin.Context, sticker *Sticker) *uploadErr {
	ctx := c.Request.Context()
	if e := h.checkUploader(ctx, sticker.ServerID, sticker.UploaderID); e != nil {
		return e
	}
	if e := h.checkBody(c); e != nil {
		return e
	}
	form, e := h.readStickerForm(c, sticker.ID)
	if e != nil {
		return e
	}
	if e := fillSticker(sticker, form); e != nil {
		_ = h.store.Remove(sticker.ID)
		return e
	}
	if err := h.repo.Create(ctx, sticker); err != nil {
		log.Printf("sticker create record failed: %v", err)
		_ = h.store.Remove(sticker.ID)
		return fail(http.StatusInternalServerError, "failed to save sticker")
	}
	return nil
}

func (h *Handler) checkUploader(ctx context.Context, serverID, userID string) *uploadErr {
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
	if !permission.Has(perms, permission.AddStickers) {
		return &uploadErr{status: http.StatusForbidden, body: gin.H{
			"error": ErrCannotAddSticker.Error(), "code": "missing_permission",
		}}
	}
	return h.checkServerRoom(ctx, serverID)
}

func (h *Handler) checkServerRoom(ctx context.Context, serverID string) *uploadErr {
	count, err := h.repo.CountByServer(ctx, serverID)
	if err != nil {
		return fail(http.StatusInternalServerError, "failed to check server sticker limit")
	}
	if count >= h.maxPerServer {
		return fail(http.StatusConflict, ErrServerFull.Error())
	}
	return nil
}

// checkBody recusa corpo grande demais ou sem espaço em disco.
func (h *Handler) checkBody(c *gin.Context) *uploadErr {
	incoming := c.Request.ContentLength
	if incoming < 0 {
		incoming = h.maxStickerBytes
	}
	if !h.space.HasRoom(incoming) {
		return fail(http.StatusInsufficientStorage, "server out of space")
	}
	if c.Request.ContentLength > h.maxStickerBytes+multipartOverhead {
		return fail(http.StatusRequestEntityTooLarge, "file too large (max 1 MB)")
	}
	return nil
}

func (h *Handler) readStickerForm(c *gin.Context, id string) (media.Form, *uploadErr) {
	reader, err := c.Request.MultipartReader()
	if err != nil {
		return media.Form{}, fail(http.StatusBadRequest, "multipart/form-data required")
	}
	form, err := h.store.ReadForm(reader, media.FormSpec{
		ID:       id,
		MaxFile:  h.maxStickerBytes,
		MaxField: maxFieldBytes,
		Fields:   []string{"name"},
	})
	if err != nil {
		return media.Form{}, fail(formErrorStatus(err))
	}
	return form, nil
}

func formErrorStatus(err error) (int, string) {
	switch {
	case errors.Is(err, media.ErrMissingFile):
		return http.StatusBadRequest, "image file is required"
	case errors.Is(err, media.ErrBadForm):
		return http.StatusBadRequest, "invalid multipart body"
	case errors.Is(err, media.ErrTooLarge):
		return http.StatusRequestEntityTooLarge, "file too large (max 1 MB)"
	case errors.Is(err, syscall.ENOSPC):
		return http.StatusInsufficientStorage, "server out of space"
	default:
		log.Printf("sticker save failed: %v", err)
		return http.StatusInternalServerError, "failed to save file"
	}
}

// fillSticker valida o nome e o tipo da imagem e preenche a figurinha.
func fillSticker(sticker *Sticker, form media.Form) *uploadErr {
	name, err := sanitizeName(form.Fields["name"])
	if err != nil {
		return fail(http.StatusBadRequest, err.Error())
	}
	kind, contentType, ok := media.Sniff(form.Head, form.Declared)
	if !ok || kind != media.KindImage || !allowedImage(contentType) {
		return fail(http.StatusUnsupportedMediaType, "only image files (png, webp, gif) are allowed for stickers")
	}
	sticker.Name = name
	sticker.ContentType = contentType
	sticker.SizeBytes = form.Size
	return nil
}

func allowedImage(contentType string) bool {
	return contentType == "image/png" || contentType == "image/webp" || contentType == "image/gif"
}
