package event

import "github.com/gin-gonic/gin"

// Routes registra as rotas dos eventos do servidor. b pode ser nil (sem banner).
func Routes(router *gin.RouterGroup, h *Handler, b *BannerHandler, authMiddleware gin.HandlerFunc) {
	events := router.Group("/servers/:id/events")
	events.Use(authMiddleware)
	{
		events.GET("", h.List)
		// Antes de /:eventId, como o banner: não são ids de evento.
		events.GET("/access", h.Access)
		events.GET("/roles", h.RoleSettings)
		events.PUT("/roles/:roleId", h.SetRoleActions)
		events.POST("", h.Create)
		if b != nil {
			// Antes de /:eventId: "banner" não é id de evento.
			events.POST("/banner", b.Upload)
		}
		events.PATCH("/:eventId", h.Update)
		events.DELETE("/:eventId", h.Cancel)
		events.PUT("/:eventId/rsvp", h.SetRSVP)
		events.DELETE("/:eventId/rsvp", h.ClearRSVP)
		events.GET("/:eventId/rsvps", h.ListGoing)
	}

	if b != nil {
		// Sem Bearer: a tag <img> manda o media token em ?token=.
		router.GET("/event-banners/:bannerId", b.Serve)
	}
}
