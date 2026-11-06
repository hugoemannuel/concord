package guest

import (
	"time"

	"gin-quickstart/backend/internal/platform/ratelimit"

	"github.com/gin-gonic/gin"
)

// Limites por IP das rotas públicas do link (quem tenta adivinhar tokens ou
// criar visitantes em massa).
const (
	previewPerIP = 60
	joinPerIP    = 10
	limitWindow  = 10 * time.Minute
	limitMaxKeys = 10000
	tooMany      = "muitas tentativas; espere um pouco"
)

// Middlewares das rotas: auth (só conta), memberOrGuest (conta ou visitante) e
// optionalAuth (põe o userID de quem está logado sem recusar anônimos).
type Middlewares struct {
	Auth, MemberOrGuest, OptionalAuth gin.HandlerFunc
}

func Routes(router *gin.RouterGroup, h *Handler, mw Middlewares) {
	previews := ratelimit.New(previewPerIP, limitWindow, limitMaxKeys)
	joins := ratelimit.New(joinPerIP, limitWindow, limitMaxKeys)

	invites := router.Group("/guest-invites")
	invites.GET("/:id", ratelimit.ByIP(previews, tooMany), h.Preview)
	invites.POST("/:id/join", ratelimit.ByIP(joins, tooMany), mw.OptionalAuth, h.Join)
	invites.POST("", mw.Auth, h.Create)
	invites.GET("", mw.Auth, h.List)
	invites.DELETE("/:id", mw.Auth, h.Revoke)

	router.POST("/guests/:userId/end", mw.Auth, h.End)
	router.GET("/guest/passes", mw.MemberOrGuest, h.Passes)
}
