package musiclinks

import "github.com/gin-gonic/gin"

func Routes(api *gin.RouterGroup, h *Handler, authMiddleware gin.HandlerFunc) {
	api.GET("/music/links", authMiddleware, h.Links)
}
