package audit

import "github.com/gin-gonic/gin"

func Routes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	router.GET("/servers/:id/audit-log", authMiddleware, handler.List)
}
