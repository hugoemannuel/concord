package main

import (
	"net/http"
	"strings"

	"gin-quickstart/backend/internal/liveobs"
	"gin-quickstart/backend/internal/platform/hoststats"
	"gin-quickstart/backend/internal/platform/httpmetrics"
	"gin-quickstart/backend/internal/serverobs"

	"github.com/gin-gonic/gin"
)

// wireServerObs: métricas da API e da VPS (docs/adr/0067-metricas-da-api-e-da-vps.md).
// A cada minuto, os contadores da API (middleware) viram uma linha em
// api_metrics (e, de 5 em 5 min, as rotas em api_route_metrics) e o /proc da
// máquina vira uma linha em host_metrics. Tudo fica 14 dias.
func (a *app) wireServerObs() {
	recorder := httpmetrics.New(httpmetrics.Config{ConnectionRoute: "/ws", Skip: skipMetrics})
	a.middlewares = append(a.middlewares, recorder.Middleware())
	apiRepo := serverobs.NewAPIRepository(a.db)
	hostRepo := serverobs.NewHostRepository(a.db)
	go serverobs.NewAPICollector(recorder, serverobs.PoolStatsOf(a.db), apiRepo).Run(a.ctx)
	// Disco da pasta de dados e backups: relativos à pasta de trabalho do
	// serviço (/opt/concord na VPS). Sem a pasta de backups, fica nulo.
	machine := hoststats.NewMachine(envOr("OBS_DISK_PATH", "."))
	go serverobs.NewHostCollector(machine, hostRepo, envOr("OBS_BACKUP_DIR", "backups")).Run(a.ctx)
	// Painel dos devs (dev_badge_users, como o /api/obs/lives).
	report := serverobs.NewReportHandler(liveobs.NewReportRepository(a.db), apiRepo, hostRepo)
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		serverobs.ReportRoutes(api, report, a.authMiddleware)
	})
	go serverobs.NewRetention(apiRepo, hostRepo).Run(a.ctx)
}

// skipMetrics: fora da conta da API ficam o /healthz, os downloads longos
// (atualizações, mídia do chat, o vídeo do assistir junto, que dura minutos) e
// os WebSockets que não são o do app (o /rtc do LiveKit); o /ws conta como
// conexão.
func skipMetrics(c *gin.Context) bool {
	route := c.FullPath()
	return route == "/healthz" || route == "/api/music/video/:itemId" || isLongDownload(c.Request) ||
		(route != "/ws" && isUpgrade(c.Request))
}

func isUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}
