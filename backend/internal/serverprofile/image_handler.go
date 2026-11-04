package serverprofile

import (
	"context"
	"net/http"
	"path"

	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ImageMedia: o upload e a entrega de imagens (user.ProfileHandler numa pasta
// própria: PNG, JPEG ou WEBP de até 10 MB, tipo conferido pelos bytes). GIF é
// recusado, como no fundo dos temas (image_janitor.go apaga o que sobrar).
type ImageMedia interface {
	UploadImage(c *gin.Context, apply user.ImageApply)
	ServeMedia(c *gin.Context)
}

// ImageHandler recebe e entrega as imagens do perfil.
type ImageHandler struct {
	handler *Handler
	media   ImageMedia
}

func NewImageHandler(handler *Handler, media ImageMedia) *ImageHandler {
	return &ImageHandler{handler: handler, media: media}
}

// Upload: POST /servers/:id/profile/image. Devolve a URL; quem grava é o PUT do perfil.
func (h *ImageHandler) Upload(c *gin.Context) {
	if !h.handler.requireManage(c) {
		return
	}
	h.media.UploadImage(c, func(_ context.Context, _ string, url *string) (*string, bool) {
		id := path.Base(*url)
		if uuid.Validate(id) != nil {
			c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported file type"})
			return nil, false
		}
		c.JSON(http.StatusCreated, gin.H{"url": ImagePath + id})
		return nil, true
	})
}
