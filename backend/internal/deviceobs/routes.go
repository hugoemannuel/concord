package deviceobs

import "github.com/gin-gonic/gin"

// IngestRoutes: o app manda as métricas do aparelho (só conta com login).
func IngestRoutes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	router.POST("/obs/device", authMiddleware, handler.Ingest)
}

// ReportRoutes: o painel do aparelho (o handler confere se é dev).
func ReportRoutes(router *gin.RouterGroup, handler *ReportHandler, authMiddleware gin.HandlerFunc) {
	router.GET("/obs/devices", authMiddleware, handler.Devices)
}
