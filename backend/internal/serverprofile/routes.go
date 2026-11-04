package serverprofile

import (
	"net/http"
	"time"

	"gin-quickstart/backend/internal/platform/ratelimit"

	"github.com/gin-gonic/gin"
)

// Limite do cartão e da prévia pública: por IP, em memória, como o do convite.
const (
	cardPerIP   = 60
	cardWindow  = time.Minute
	cardMaxKeys = 10000
)

func limitByIP(limiter *ratelimit.Limiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if retry, ok := limiter.Allow(ratelimit.IPKey(c.ClientIP())); !ok {
			c.Header("Retry-After", ratelimit.RetryAfterSeconds(retry))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests"})
			return
		}
		c.Next()
	}
}

// Routes registra o perfil, as imagens e a tag. optionalAuth: a prévia do
// convite abre antes do login.
func Routes(router *gin.RouterGroup, h *Handler, tags *TagHandler, images *ImageHandler, authMiddleware, optionalAuth gin.HandlerFunc) {
	limit := limitByIP(ratelimit.New(cardPerIP, cardWindow, cardMaxKeys))

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
