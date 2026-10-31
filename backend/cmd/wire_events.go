package main

import (
	"path/filepath"

	"gin-quickstart/backend/internal/event"

	"github.com/gin-gonic/gin"
)

// O Salinha Bot que avisa as propostas também avisa os eventos.
var _ event.Notifier = salinhaBotNotifier{}

// wireEvents: eventos do servidor, presença e o ticker dos avisos do Salinha
// Bot (docs/EVENTOS.md). O ticker para junto com o contexto do app.
func (a *app) wireEvents() {
	repo := event.NewRepository(a.db)
	// Cada evento abre a própria sala (voz e texto, só para quem confirmou) na hora
	// de começar e a apaga no fim.
	rooms := event.NewRooms(a.channelService, a.permissionService, a.callService, repo)
	banners := mustStore(filepath.Join(a.uploadsDir, event.BannerDir), "event banners dir")
	service := event.NewService(repo, repo, a.permissionService, a.hub).WithRooms(rooms).WithBanners(banners)
	service.SetAudit(a.audit)
	bannerHandler := event.NewBannerHandler(banners, a.uploadSpace, repo, a.permissionService, a.authService, repo)

	notifier := salinhaBotNotifier{conversations: a.conversationService, messages: a.messageService}
	go event.NewScheduler(repo, notifier, rooms, a.hub).Run(a.ctx)
	// Banner trocado, cancelado ou nunca usado não fica no disco.
	go event.NewBannerJanitor(banners, repo).Run(a.ctx)

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		event.Routes(api, event.NewHandler(service), bannerHandler, a.authMiddleware)
	})
}
