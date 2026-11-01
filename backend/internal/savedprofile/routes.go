package savedprofile

import "github.com/gin-gonic/gin"

func Routes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	saved := router.Group("/users/me/saved-profiles")
	saved.Use(authMiddleware)
	{
		saved.GET("", handler.List)
		saved.POST("", handler.Create)
		saved.PUT("/:id", handler.Overwrite)
		saved.PATCH("/:id", handler.Rename)
		saved.DELETE("/:id", handler.Delete)
		saved.POST("/:id/apply", handler.Apply)
	}
}
