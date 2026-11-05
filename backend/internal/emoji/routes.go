package emoji

import "github.com/gin-gonic/gin"

func Routes(router *gin.RouterGroup, h *Handler, base *BaseHandler, authMiddleware gin.HandlerFunc) {
	servers := router.Group("/servers/:id/emojis")
	servers.Use(authMiddleware)
	{
		servers.POST("", h.Upload)
		servers.PATCH("/:emojiId", h.Update)
		servers.DELETE("/:emojiId", h.Delete)
	}

	mine := router.Group("/emojis")
	mine.Use(authMiddleware)
	{
		mine.GET("", h.ListMine)
		mine.GET("/base", base.Serve)
	}

	// Sem Bearer: a tag <img> manda o media token em ?token=.
	router.GET("/emojis/:emojiId/file", h.ServeFile)
}
