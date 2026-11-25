package apperrors

import "github.com/gin-gonic/gin"

// IngestRoutes: o app manda os erros (só conta com login; visitante não).
func IngestRoutes(router *gin.RouterGroup, handler *IngestHandler, authMiddleware gin.HandlerFunc) {
	router.POST("/obs/errors", authMiddleware, handler.Ingest)
}

// ReportRoutes: o painel de erros (o handler confere se é dev).
func ReportRoutes(router *gin.RouterGroup, handler *ReportHandler, authMiddleware gin.HandlerFunc) {
	router.GET("/obs/errors", authMiddleware, handler.List)
	router.GET("/obs/errors/:fingerprint", authMiddleware, handler.Detail)
}
