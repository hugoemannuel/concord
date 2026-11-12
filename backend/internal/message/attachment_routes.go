package message

import "github.com/gin-gonic/gin"

func AttachmentRoutes(router *gin.RouterGroup, h *AttachmentHandler, authMiddleware gin.HandlerFunc) {
	channels := router.Group("/channels/:channelId/attachments")
	channels.Use(authMiddleware)
	{
		channels.POST("", h.UploadToChannel)
		channels.POST("/", h.UploadToChannel)
	}

	conversations := router.Group("/conversations/:id/attachments")
	conversations.Use(authMiddleware)
	{
		conversations.POST("", h.UploadToConversation)
		conversations.POST("/", h.UploadToConversation)
	}

	media := router.Group("/media")
	{
		media.GET("/token", authMiddleware, h.MediaToken)
		// Sem Bearer: <img>/<video>/<audio> mandam o token de mídia em ?token=.
		media.GET("/:attachmentId", h.ServeFile)
	}
}

// ViewOnceRoutes: abrir a mídia de visualização única (devolve o token).
func ViewOnceRoutes(router *gin.RouterGroup, h *ViewOnceHandler, authMiddleware gin.HandlerFunc) {
	router.POST("/attachments/:id/open", authMiddleware, h.Open)
}
