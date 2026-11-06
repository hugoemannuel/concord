package sticker

import (
	"context"
	"gin-quickstart/backend/internal/audit"
	"log"
	"net/http"

	"gin-quickstart/backend/internal/expression"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/platform/media"
	"gin-quickstart/backend/internal/platform/wsevent"

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
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	sticker := &Sticker{ID: uuid.New().String(), ServerID: c.Param("id"), UploaderID: userID}
	if e := h.receiveSticker(c, sticker); e != nil {
		c.JSON(e.status, e.body)
		return
	}
	if h.publisher != nil {
		h.publisher.BroadcastToRoom("server:"+sticker.ServerID, wsevent.Marshal("sticker:created", CreatedEvent{
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
	return expression.CheckUploader(ctx, expression.Uploader{
		Members: h.servers, Perms: h.permissions, Counter: h.repo,
		Permission: permission.AddStickers, Max: h.maxPerServer,
	}, serverID, userID, uploaderErrors)
}

// uploaderErrors: a resposta de cada recusa de quem envia.
var uploaderErrors = expression.UploaderErrors[*uploadErr]{
	MemberCheck: fail(http.StatusInternalServerError, "failed to check membership"),
	NotMember:   fail(http.StatusForbidden, ErrNotServerMember.Error()),
	PermsCheck:  fail(http.StatusInternalServerError, "failed to check permissions"),
	MissingPermission: &uploadErr{status: http.StatusForbidden, body: gin.H{
		"error": ErrCannotAddSticker.Error(), "code": "missing_permission",
	}},
	CountCheck: fail(http.StatusInternalServerError, "failed to check server sticker limit"),
	Full:       fail(http.StatusConflict, ErrServerFull.Error()),
}

// readStickerForm confere o corpo (espaço em disco e tamanho) e lê o upload.
func (h *Handler) readStickerForm(c *gin.Context, id string) (media.Form, *uploadErr) {
	reader, err := media.OpenUpload(c.Writer, c.Request, h.space, media.UploadSpec{
		Limit: h.maxStickerBytes + multipartOverhead,
		Room:  h.maxStickerBytes,
	})
	if err != nil {
		return media.Form{}, formError(err)
	}
	form, err := h.store.ReadForm(reader, media.FormSpec{
		ID:       id,
		MaxFile:  h.maxStickerBytes,
		MaxField: maxFieldBytes,
		Fields:   []string{"name"},
	})
	if err != nil {
		return media.Form{}, formError(err)
	}
	return form, nil
}

// formErrors: a resposta de cada recusa do upload.
var formErrors = media.UploadErrors[*uploadErr]{
	MissingFile:  fail(http.StatusBadRequest, "image file is required"),
	BadForm:      fail(http.StatusBadRequest, "invalid multipart body"),
	NotMultipart: fail(http.StatusBadRequest, "multipart/form-data required"),
	TooLarge:     fail(http.StatusRequestEntityTooLarge, "file too large (max 1 MB)"),
	NoSpace:      fail(http.StatusInsufficientStorage, "server out of space"),
}

func formError(err error) *uploadErr {
	if e, ok := formErrors.For(err); ok {
		return e
	}
	log.Printf("sticker save failed: %v", err)
	return fail(http.StatusInternalServerError, "failed to save file")
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
