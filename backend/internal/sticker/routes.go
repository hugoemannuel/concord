package sticker

import "github.com/gin-gonic/gin"

func Routes(router *gin.RouterGroup, h *Handler, authMiddleware gin.HandlerFunc) {
	servers := router.Group("/servers/:id/stickers")
	servers.Use(authMiddleware)
	{
		servers.GET("", h.List)
		servers.GET("/", h.List)
		servers.POST("", h.Upload)
		servers.POST("/", h.Upload)
		servers.DELETE("/:stickerId", h.Delete)
	}

	mine := router.Group("/stickers")
	mine.Use(authMiddleware)
	mine.GET("", h.ListMine)

	// Sem Bearer: img tag envia o media token em ?token=.
	router.GET("/stickers/:stickerId/file", h.ServeFile)
}
