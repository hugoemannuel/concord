package main

import (
	"context"
	"log"

	"gin-quickstart/backend/internal/auth"
	"gin-quickstart/backend/internal/platform/mailer"
	"gin-quickstart/backend/internal/platform/websocket"
	"gin-quickstart/backend/internal/updates"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// wireRealtime: endpoint do WebSocket, presença e digitação.
func (a *app) wireRealtime() {
	// "Fulano está digitando…": mesma regra de escrita das mensagens.
	typing := websocket.NewTyping(a.hub, a.roomAccess, a.userService.FindByID)
	wsHandler := websocket.WsHandler(a.hub, a.authService, a.permissionService, a.permissionService, a.conversationService, a.callPresence.Router(a.callAFK.Router(a.callService)), typing).WithMobileApps(a.mobileApps)
	a.hub.SetDisconnectHandler(a.callService.HandleDisconnect)

	a.route(func(router *gin.Engine, api *gin.RouterGroup) {
		presence := api.Group("/presence")
		presence.Use(a.authMiddleware)
		{
			presence.GET("", wsHandler.Presence)
			presence.GET("/", wsHandler.Presence)
			presence.GET("/activities", wsHandler.Activities)
		}
		// WebSocket endpoint (public, auth via ?token=)
		router.GET("/ws", wsHandler.ServeWS)
	})
}

// wireAccount: login, cadastro, e-mails da conta e troca de @/e-mail.
func (a *app) wireAccount() {
	appURL := envOr("APP_URL", "http://localhost:5173")
	emailService := auth.NewEmailService(a.authRepository, a.userService, a.authService, mailer.FromEnv(), appURL)
	authHandler := auth.AuthHandler(a.authService, a.userService).WithEmail(emailService)
	// Trocar @ e e-mail em Minha conta: o @ novo vai para todos pelo hub.
	accountHandler := auth.NewAccountHandler(authHandler, a.userService, user.NewAccountService(a.userRepository, a.hub))
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		auth.AuthRoutes(api, authHandler, a.authMiddleware)
		auth.AccountRoutes(api, accountHandler, a.authMiddleware)
	})
	a.wireAccountDeletion(accountHandler)
}

// wireUpdates: atualizações do app (scripts/release-win.sh publica em UPDATES_DIR).
func (a *app) wireUpdates() {
	updatesDir := envOr("UPDATES_DIR", "updates")
	// Versão nova publicada: avisa os apps na hora (sem esperar a checagem periódica).
	go updates.NewWatcher(updatesDir, func(r updates.Release) {
		log.Printf("[updates] nova versão em %s: %s", r.File, r.Version)
		a.hub.PublishAppUpdate(r.File, r.Version)
	}).Run(context.Background(), updates.PollInterval)
	a.route(func(router *gin.Engine, _ *gin.RouterGroup) {
		updates.Routes(router, updatesDir)
	})
}
