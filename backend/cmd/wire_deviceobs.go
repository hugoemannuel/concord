package main

import (
	"gin-quickstart/backend/internal/deviceobs"

	"github.com/gin-gonic/gin"
)

// wireDeviceObs: métricas do aparelho (docs/adr/0069-metricas-do-aparelho.md).
// O app manda, com login, as linhas agregadas por minuto (CPU e memória do
// app, a máquina, travadas, rede do app) em device_sessions/device_samples;
// os devs (dev_badge_users) leem o painel. Tudo fica 14 dias.
func (a *app) wireDeviceObs() {
	repo := deviceobs.NewRepository(a.db)
	ingest := deviceobs.NewHandler(repo)
	report := deviceobs.NewReportHandler(deviceobs.NewReportRepository(a.db))
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		deviceobs.IngestRoutes(api, ingest, a.authMiddleware)
		deviceobs.ReportRoutes(api, report, a.authMiddleware)
	})
	go deviceobs.NewRetention(repo).Run(a.ctx)
}
