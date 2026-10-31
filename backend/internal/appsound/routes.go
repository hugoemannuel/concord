package appsound

import "github.com/gin-gonic/gin"

// Routes: as escolhas e os áudios da própria pessoa (com login) e o arquivo
// (público, para o app carregar sem token).
func Routes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	me := router.Group("/users/me/app-sounds")
	me.Use(authMiddleware)
	{
		me.GET("", handler.Get)
		me.PUT("", handler.Save)
		me.POST("/:event", handler.Upload)
		me.DELETE("/:event", handler.Delete)
	}

	router.GET("/app-sounds/:id", handler.Serve)
}
