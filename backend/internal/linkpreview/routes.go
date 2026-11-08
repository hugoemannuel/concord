package linkpreview

import "github.com/gin-gonic/gin"

// Routes: a prévia exige login; a imagem não (ver Handler.Image).
func Routes(api *gin.RouterGroup, h *Handler, authMiddleware gin.HandlerFunc) {
	api.GET("/link-previews", authMiddleware, h.Get)
	api.GET("/link-previews/image/:id", h.Image)
}
