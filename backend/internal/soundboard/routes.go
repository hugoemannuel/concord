package soundboard

import "github.com/gin-gonic/gin"

func Routes(router *gin.RouterGroup, h *Handler, authMiddleware gin.HandlerFunc) {
	servers := router.Group("/servers/:id/soundboard")
	servers.Use(authMiddleware)
	{
		servers.GET("", h.List)
		servers.GET("/", h.List)
		servers.POST("", h.Upload)
		servers.POST("/", h.Upload)
		servers.PATCH("/:soundId", h.Update)
		servers.DELETE("/:soundId", h.Delete)
	}

	// Sem Bearer: o elemento <audio> envia o media token em ?token=.
	router.GET("/soundboard/:soundId/file", h.ServeFile)
}
