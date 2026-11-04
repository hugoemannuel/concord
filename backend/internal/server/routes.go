package server

import (
	"gin-quickstart/backend/internal/platform/ratelimit"

	"github.com/gin-gonic/gin"
)

// optionalAuth: põe o userID de quem está logado sem recusar anônimos (prévia do convite).
func ServerRoutes(router *gin.RouterGroup, handler *Handler, authMiddleware, requireVerified, optionalAuth gin.HandlerFunc) {
	servers := router.Group("/servers")
	servers.Use(authMiddleware)
	{
		servers.POST("", handler.Create)
		servers.POST("/", handler.Create)
		servers.GET("", handler.ListByUser)
		servers.GET("/", handler.ListByUser)
		servers.GET("/:id", handler.GetByID)
		servers.PUT("/:id", handler.Update)
		servers.DELETE("/:id", handler.Delete)
		servers.POST("/:id/icon", handler.UploadIcon)
		servers.DELETE("/:id/icon", handler.DeleteIcon)
		servers.POST("/:id/invite", requireVerified, handler.InviteMember)
		servers.GET("/:id/invites", handler.ListServerInvites)
		servers.GET("/:id/invite-code", handler.InviteCode)
		servers.POST("/:id/invite-code/reset", handler.RotateInviteCode)
		servers.DELETE("/:id/members/:userId", handler.Kick)
		servers.PUT("/:id/members/:userId/nickname", handler.SetNickname)
		servers.POST("/:id/leave", handler.Leave)
		servers.GET("/:id/bans", handler.ListBans)
		servers.POST("/:id/bans", handler.Ban)
		servers.DELETE("/:id/bans/:userId", handler.Unban)
		servers.PUT("/:id/primary-channel", handler.SetPrimaryChannel)
		servers.POST("/:id/music-bot", handler.EnableMusicBot)
		servers.DELETE("/:id/music-bot", handler.DisableMusicBot)
	}

	invites := router.Group("/invites")
	invites.Use(authMiddleware)
	{
		invites.GET("", handler.ListInvites)
		invites.GET("/", handler.ListInvites)
		invites.POST("/join", requireVerified, handler.JoinByCode)
		invites.POST("/:id/accept", requireVerified, handler.AcceptInvite)
		invites.POST("/:id/decline", handler.DeclineInvite)
	}

	// Prévia do link de convite: pública (a página abre antes do login), com
	// limite por IP contra quem tenta adivinhar códigos.
	previewLimiter := ratelimit.New(invitePreviewPerIP, invitePreviewWindow, invitePreviewMaxKeys)
	public := router.Group("/invites")
	public.GET("/:id/preview", limitByIP(previewLimiter, "too many requests"), optionalAuth, handler.InvitePreview)

	me := router.Group("/users/me")
	me.Use(authMiddleware)
	{
		me.GET("/server-layout", handler.GetRailLayout)
		me.PUT("/server-layout", handler.SetRailLayout)
	}
}
