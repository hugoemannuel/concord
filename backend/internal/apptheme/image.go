package apptheme

import (
	"context"
	"net/http"
	"path"

	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Imagem de fundo dos temas próprios (ADR 0043). O upload é o mesmo do avatar
// (user.ProfileHandler: PNG, JPEG ou WEBP de até 10 MB, tipo pelos bytes), numa
// pasta própria; GIF é recusado (o fundo não anima). A imagem é pública como o
// avatar (o nome é um UUID novo a cada envio) e image_janitor.go apaga as que
// nenhum tema usa mais.

const (
	ImageDir  = "app-theme-images"
	imagePath = "/api/app-theme-images/"
)

// ImageMedia: o upload e a entrega de imagens (user.ProfileHandler numa pasta própria).
type ImageMedia interface {
	UploadImage(c *gin.Context, apply user.ImageApply)
	ServeMedia(c *gin.Context)
}

type ImageHandler struct {
	media ImageMedia
}

func NewImageHandler(media ImageMedia) *ImageHandler {
	return &ImageHandler{media: media}
}

// stillImageID: o arquivo salvo, se for imagem parada (GIF vem com "a_").
func stillImageID(url string) (string, bool) {
	id := path.Base(url)
	parsed, err := uuid.Parse(id)
	return id, err == nil && parsed.String() == id
}

// Upload: POST /users/me/app-themes/image (multipart, campo "file"). Devolve a
// URL que o tema guarda em "image"; quem salva o tema é o PUT de sempre.
func (h *ImageHandler) Upload(c *gin.Context) {
	h.media.UploadImage(c, func(_ context.Context, _ string, url *string) (*string, bool) {
		id, ok := stillImageID(*url)
		if !ok {
			c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported file type"})
			return nil, false
		}
		c.JSON(http.StatusCreated, gin.H{"url": imagePath + id})
		return nil, true
	})
}

// ImageRoutes: envio (com login) e entrega (sem token: o CSS do fundo não manda Bearer).
func ImageRoutes(router *gin.RouterGroup, h *ImageHandler, authMiddleware gin.HandlerFunc) {
	router.POST("/users/me/app-themes/image", authMiddleware, h.Upload)
	router.GET("/app-theme-images/:id", h.media.ServeMedia)
}
