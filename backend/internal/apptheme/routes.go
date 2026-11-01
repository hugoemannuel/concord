package apptheme

import "github.com/gin-gonic/gin"

// Routes: os temas próprios da pessoa (com login).
func Routes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	me := router.Group("/users/me/app-themes")
	me.Use(authMiddleware)
	{
		me.GET("", handler.Get)
		me.PUT("", handler.Save)
	}
}
