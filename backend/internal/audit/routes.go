package audit

import "github.com/gin-gonic/gin"

func AuditRoutes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	servers := router.Group("/servers/:id")
	servers.Use(authMiddleware)
	{
		servers.GET("/audit-logs", handler.List)
	}
}
