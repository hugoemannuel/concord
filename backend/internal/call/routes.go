package call

import "github.com/gin-gonic/gin"

// memberOrGuest: as rotas que o visitante sem conta também usa para estar na
// call (entrar, estado, token da mídia, miniatura da transmissão). O escopo
// (só o canal do convite) é conferido no service, como para qualquer pessoa.
func CallRoutes(router *gin.RouterGroup, handler *Handler, authMiddleware, memberOrGuest gin.HandlerFunc) {
	calls := router.Group("/calls")
	member := calls.Group("", authMiddleware)
	{
		member.POST("/move", handler.Move)
		member.GET("/active", handler.Active)
		member.POST("/:id/accept", handler.Accept)
		member.POST("/:id/invites", handler.InviteFriends)
		member.GET("/:id/invite", handler.InviteStatus)
		member.POST("/:id/invites/open", handler.OpenFriendInvite)
		member.DELETE("/:id", handler.Delete)
		member.POST("/:id/participants/:userId/server-mute", handler.ServerMute)
		member.POST("/:id/participants/:userId/server-deafen", handler.ServerDeafen)
		member.DELETE("/:id/participants/:userId", handler.Disconnect)
	}
	open := calls.Group("", memberOrGuest)
	{
		open.POST("", handler.Create)
		open.GET("/:id/state", handler.State)
		open.POST("/:id/token", handler.Token)
		open.PUT("/:id/screen-preview", handler.PutScreenPreview)
		open.GET("/:id/screen-preview/:userId", handler.GetScreenPreview)
	}
}
