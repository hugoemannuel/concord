package conversation

import "github.com/gin-gonic/gin"

func ConversationRoutes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	conversations := router.Group("/conversations")
	conversations.Use(authMiddleware)
	{
		conversations.GET("", handler.List)
		conversations.GET("/", handler.List)
		conversations.GET("/with/:userId", handler.GetOrCreateWith)
		conversations.POST("/group", handler.CreateGroup)
		conversations.GET("/:id", handler.Get)
		conversations.PUT("/:id", handler.Update)
		conversations.POST("/:id/icon", handler.UploadIcon)
		conversations.DELETE("/:id/icon", handler.DeleteIcon)
		conversations.POST("/:id/members", handler.AddMembers)
		conversations.DELETE("/:id/members/:userId", handler.RemoveMember)
		conversations.POST("/:id/hide", handler.Hide)
		conversations.POST("/:id/read", handler.MarkRead)
		conversations.PUT("/:id/disappearing", handler.SetDisappearing)
	}
}
