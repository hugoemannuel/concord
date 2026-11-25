package changelog

import "github.com/gin-gonic/gin"

// Routes: a lista exige login; a versão mínima é pública (a janelinha de
// abertura não tem token); o PUT não usa JWT, só o token do CI.
func Routes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	router.GET("/changelog", authMiddleware, handler.List)
	router.GET("/changelog/required", handler.Required)
	router.PUT("/changelog/:version", handler.Publish)
}
