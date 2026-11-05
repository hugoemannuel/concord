package plugin

import "github.com/gin-gonic/gin"

func Routes(router *gin.RouterGroup, h *Handler, authMiddleware, requireVerified gin.HandlerFunc) {
	router.GET("/plugins", authMiddleware, h.List)
	router.POST("/plugins", authMiddleware, requireVerified, h.Create)
	router.PATCH("/plugins/:pluginId/review", authMiddleware, h.Review)
	router.GET("/servers/:id/plugins", authMiddleware, h.ListServer)
	router.PUT("/servers/:id/plugins/:pluginId", authMiddleware, h.Install)
	router.DELETE("/servers/:id/plugins/:pluginId", authMiddleware, h.Uninstall)
	router.PUT("/servers/:id/plugins/:pluginId/me", authMiddleware, h.SetEnabled)
}
