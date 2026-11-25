package main

import (
	"gin-quickstart/backend/internal/apperrors"
	"gin-quickstart/backend/internal/liveobs"
	"gin-quickstart/backend/internal/platform/recovery"

	"github.com/gin-gonic/gin"
)

// wireAppErrors: relatório de erros do app (docs/adr/0068-relatorio-de-erros-do-app.md).
// O app manda os erros já limpos (POST /api/obs/errors); os panics do backend
// chegam pelo recovery e são gravados de 10 em 10 s. O painel dos devs traduz a
// pilha do renderer pelos source maps de SOURCEMAPS_DIR (vazio = sem tradução).
// Tudo fica 14 dias.
func (a *app) wireAppErrors() {
	repo := apperrors.NewRepository(a.db)
	ingest := apperrors.NewIngestHandler(repo)
	translator := apperrors.NewTranslator(envOr("SOURCEMAPS_DIR", apperrors.DefaultSourceMapsDir))
	// Quem é dev: a mesma regra do painel das lives (dev_badge_users).
	report := apperrors.NewReportHandler(liveobs.NewReportRepository(a.db), repo, translator)

	recorder := apperrors.NewPanicRecorder(repo)
	recovery.Observe(recorder.Observe)
	go recorder.Run(a.ctx)

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		apperrors.IngestRoutes(api, ingest, a.authMiddleware)
		apperrors.ReportRoutes(api, report, a.authMiddleware)
	})
	go liveobs.NewRetention(repo).Run(a.ctx)
}
