package apperrors

import "github.com/gin-gonic/gin"

// IngestRoutes: o app manda os erros (só conta com login; visitante não).
func IngestRoutes(router *gin.RouterGroup, handler *IngestHandler, authMiddleware gin.HandlerFunc) {
	router.POST("/obs/errors", authMiddleware, handler.Ingest)
}
