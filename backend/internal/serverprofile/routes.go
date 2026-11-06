package serverprofile

import (
	"time"

	"gin-quickstart/backend/internal/platform/ratelimit"

	"github.com/gin-gonic/gin"
)

// Limite do cartão e da prévia pública: por IP, em memória, como o do convite.
const (
	cardPerIP   = 120
	cardWindow  = time.Minute
	cardMaxKeys = 10000
)

// Routes registra o perfil, as imagens e a tag. optionalAuth: a prévia do
// convite abre antes do login.
func Routes(router *gin.RouterGroup, h *Handler, tags *TagHandler, images *ImageHandler, authMiddleware, optionalAuth gin.HandlerFunc) {
	limit := ratelimit.ByIP(ratelimit.New(cardPerIP, cardWindow, cardMaxKeys), "too many requests")

	servers := router.Group("/servers/:id", authMiddleware)
	servers.GET("/card", limit, h.GetCard)
	servers.PUT("/profile", h.UpdateProfile)
	servers.GET("/profile/member-games", h.GetMemberGames)
	servers.POST("/profile/image", images.Upload)

	router.GET("/invites/:id/card", limit, optionalAuth, h.GetInviteCard)
	router.GET("/server-profile-images/:id", images.media.ServeMedia)

	router.POST("/server-tags/lookup", authMiddleware, tags.Lookup)
	me := router.Group("/users/me/server-tag", authMiddleware)
	me.GET("", tags.Mine)
	me.PUT("", tags.Apply)
	me.DELETE("", tags.Clear)
}
