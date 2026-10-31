package user

import "github.com/gin-gonic/gin"

func UserRoutes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	users := router.Group("/users")
	users.Use(authMiddleware)
	{
		users.GET("/me", handler.GetMe)
		users.GET("/me/birthday", handler.GetBirthday)
		users.PUT("/me/birthday", handler.SetBirthday)
		users.GET("/search", handler.SearchUsers)
		users.GET("/me/privacy", handler.GetPrivacy)
		users.PUT("/me/privacy", handler.UpdatePrivacy)
	}
}

// ProfileRoutes: edição do perfil (com login) e a mídia do perfil (pública,
// para o <img> e o overlay carregarem sem token).
func ProfileRoutes(router *gin.RouterGroup, handler *ProfileHandler, authMiddleware gin.HandlerFunc) {
	users := router.Group("/users")
	users.Use(authMiddleware)
	{
		users.GET("/:id/profile", handler.GetProfile)
		users.PUT("/me/profile", handler.UpdateProfile)
		users.PUT("/me/status", handler.SetStatus)
		users.POST("/me/avatar", handler.UploadAvatar)
		users.DELETE("/me/avatar", handler.DeleteAvatar)
		users.POST("/me/banner", handler.UploadBanner)
		users.DELETE("/me/banner", handler.DeleteBanner)
		users.POST("/me/nameplate", handler.UploadNameplate)
		users.DELETE("/me/nameplate", handler.DeleteNameplate)
		users.PUT("/me/nameplate-mode", handler.SetNameplateMode)
		users.POST("/me/decoration", handler.UploadDecoration)
		users.DELETE("/me/decoration", handler.DeleteDecoration)
	}

	router.GET("/profile-media/:id", handler.ServeMedia)
	router.GET("/profile-media/:id/static", handler.ServeStaticMedia)
}

// EntranceSoundRoutes: o som de entrada da própria pessoa (com login) e o
// arquivo (público, para o <audio> carregar sem token).
func EntranceSoundRoutes(router *gin.RouterGroup, handler *EntranceSoundHandler, authMiddleware gin.HandlerFunc) {
	me := router.Group("/users/me")
	me.Use(authMiddleware)
	{
		me.POST("/entrance-sound", handler.Upload)
		me.DELETE("/entrance-sound", handler.Delete)
	}

	router.GET("/entrance-sounds/:id", handler.Serve)
}
