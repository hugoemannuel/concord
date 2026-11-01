package auth

import "github.com/gin-gonic/gin"

func AuthRoutes(router *gin.RouterGroup, handler *Handler, authMiddleware gin.HandlerFunc) {
	auth := router.Group("/auth")
	{
		auth.POST("/register", limitBody(maxLoginBodyBytes), handler.Register)
		auth.POST("/login", limitBody(maxLoginBodyBytes), handler.Login)
		auth.POST("/refresh", handler.Refresh)
		if handler.emails != nil {
			auth.POST("/verify-email", limitBody(maxLoginBodyBytes), handler.VerifyEmail)
			auth.POST("/forgot-password", limitBody(maxLoginBodyBytes), handler.ForgotPassword)
			auth.POST("/reset-password", limitBody(maxLoginBodyBytes), handler.ResetPassword)
		}
	}

	authProtected := router.Group("/auth")
	authProtected.Use(authMiddleware)
	{
		authProtected.POST("/logout", limitBody(maxLoginBodyBytes), handler.Logout)
		authProtected.POST("/logout-all", handler.LogoutAll)
		if handler.emails != nil {
			authProtected.POST("/resend-verification", handler.ResendVerification)
		}
	}
}

// AccountRoutes: troca do nome de usuário e do e-mail (com a senha atual).
// Sem RequireVerified: quem errou o e-mail precisa conseguir corrigir.
func AccountRoutes(router *gin.RouterGroup, handler *AccountHandler, authMiddleware gin.HandlerFunc) {
	me := router.Group("/users/me")
	me.Use(authMiddleware, limitBody(maxLoginBodyBytes))
	{
		me.PUT("/username", handler.ChangeUsername)
		me.PUT("/email", handler.ChangeEmail)
	}
}
