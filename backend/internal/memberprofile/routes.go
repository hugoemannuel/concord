package memberprofile

import "github.com/gin-gonic/gin"

// Routes registra o perfil do servidor de quem está logado.
func Routes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	profile := router.Group("/servers/:id/my-profile")
	profile.Use(authMiddleware)
	{
		profile.GET("", handler.Get)
		profile.PATCH("", handler.Update)
		profile.DELETE("", handler.Delete)
		for _, kind := range []MediaKind{MediaAvatar, MediaBanner, MediaNameplate, MediaDecoration} {
			profile.POST("/"+string(kind), handler.upload(kind))
			profile.DELETE("/"+string(kind), handler.reset(kind))
		}
	}
}
