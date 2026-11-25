package main

import (
	"context"
	"errors"
	"os"
	"strings"

	"gin-quickstart/backend/internal/alert"
	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/channelcategory"
	"gin-quickstart/backend/internal/liveobs"
	"gin-quickstart/backend/internal/message"

	"github.com/gin-gonic/gin"
)

// alertMessageKind: o messages.system_kind dos alertas.
const alertMessageKind = "alert"

// wireAlerts: alertas em canais do servidor dos devs
// (docs/adr/0071-alertas-em-canais-do-servidor-dos-devs.md). ALERTS_SERVER_ID
// vazio = desligado (o painel só diz isso). Ligado: garante a categoria
// Monitoramento e os canais, avalia as regras a cada minuto, avisa o boot e a
// queda, o banco que voltou e a unidade do systemd que falhou
// (POST /internal/alerts/unit-failed, só da própria máquina). ALERTS_MUTED
// silencia regras pelo id.
func (a *app) wireAlerts() {
	serverID := strings.TrimSpace(os.Getenv("ALERTS_SERVER_ID"))
	repo := alert.NewRepository(a.db)
	rules := alert.Rules(repo)
	report := alert.NewReportHandler(repo, liveobs.NewReportRepository(a.db), alert.Titles(rules), serverID != "")
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) { alert.ReportRoutes(api, report, a.authMiddleware) })
	if serverID == "" {
		return
	}
	poster := alert.NewPoster(nil, a.postAlert)
	engine := alert.NewEngine(rules, repo, poster, envOr("APP_URL", "http://localhost:5173"), envList("ALERTS_MUTED"))
	units := alert.NewUnitHandler(engine)
	a.route(func(router *gin.Engine, _ *gin.RouterGroup) { alert.UnitRoutes(router, units) })
	store := alertChannels{repository: a.channelRepository, channels: a.channelService, categories: channelcategory.NewRepository(a.db)}
	runner := alert.Runner{
		Ensure: func(ctx context.Context) (map[alert.ChannelKind]string, error) {
			return alert.EnsureChannels(ctx, store, serverID)
		},
		Poster:    poster,
		Engine:    engine,
		Lifecycle: alert.NewLifecycle(repo, engine, alert.BuildVersion()),
		Database:  alert.NewDatabaseWatch(a.db.Ping, engine.Notify),
	}
	go liveobs.NewRetention(repo).Run(a.ctx)
	a.badgeDone = runUntilShutdown(a.badgeDone, func() { runner.Run(a.ctx) })
}

// runUntilShutdown roda fn e fecha o canal devolvido quando fn e before
// terminam: o desligamento espera a parada limpa ser gravada, junto com os
// badges (a.badgeDone), antes de o banco fechar.
func runUntilShutdown(before <-chan struct{}, fn func()) chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		fn()
		if before != nil {
			<-before
		}
	}()
	return done
}

// postAlert: a mensagem de sistema do alerta, assinada pelo Salinha Bot.
func (a *app) postAlert(ctx context.Context, channelID, text string, mentionAll bool) error {
	_, err := a.messageService.PostSystemNotice(ctx, message.SystemNotice{
		ChannelID: channelID, AuthorID: bot.SalinhaBotID, Content: text, Kind: alertMessageKind, MentionAll: mentionAll,
	})
	return err
}

// alertChannels liga o alert.ChannelStore ao channel e ao channelcategory.
type alertChannels struct {
	repository *channel.Repository
	channels   *channel.Service
	categories *channelcategory.Repository
}

func (s alertChannels) SystemChannelID(ctx context.Context, serverID string, kind alert.ChannelKind) (string, error) {
	ch, err := s.repository.FindSystemByKind(ctx, serverID, string(kind))
	if errors.Is(err, channel.ErrChannelNotFound) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return ch.ID, nil
}

func (s alertChannels) CategoryID(ctx context.Context, serverID, name string) (string, error) {
	return s.categories.FindByName(ctx, serverID, name)
}

func (s alertChannels) CreateCategory(ctx context.Context, serverID, name string) (string, error) {
	category, err := s.categories.Create(ctx, serverID, name, nil)
	return category.ID, err
}

func (s alertChannels) CreateChannel(ctx context.Context, serverID, categoryID, name string, kind alert.ChannelKind) (string, error) {
	ch, err := s.channels.CreateSystemInCategory(ctx, serverID, categoryID, name, string(kind), bot.SalinhaBotID)
	if err != nil {
		return "", err
	}
	return ch.ID, nil
}
