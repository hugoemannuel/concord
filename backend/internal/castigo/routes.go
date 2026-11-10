package castigo

import "github.com/gin-gonic/gin"

// Routes: os castigos do servidor e as votações de cada call (só com conta).
func Routes(router *gin.RouterGroup, h *Handler, auth gin.HandlerFunc) {
	servers := router.Group("/servers/:id/castigos", auth)
	servers.GET("", h.List)
	servers.POST("", h.Apply)
	servers.DELETE("/:userId", h.Lift)

	votes := router.Group("/calls/:id/castigo-votes", auth)
	votes.POST("", h.StartVote)
	votes.GET("/current", h.CurrentVote)
	votes.POST("/:voteId/ballots", h.CastVote)
}
