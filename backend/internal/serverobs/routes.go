package serverobs

import "github.com/gin-gonic/gin"

// ReportRoutes: o painel do servidor (o handler confere se é dev).
func ReportRoutes(router *gin.RouterGroup, handler *ReportHandler, authMiddleware gin.HandlerFunc) {
	router.GET("/obs/server", authMiddleware, handler.Server)
}
