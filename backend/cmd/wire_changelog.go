package main

import (
	"os"

	"gin-quickstart/backend/internal/changelog"
	"gin-quickstart/backend/internal/platform/wsevent"

	"github.com/gin-gonic/gin"
)

// wireChangelog: notas de cada versão (publicadas pelo deploy) e a versão
// mínima obrigatória (ADR 0066). Ao publicar, avisa todos os apps pelo WS para
// conferirem a versão mínima na hora.
func (a *app) wireChangelog() {
	handler := changelog.NewHandler(changelog.NewRepository(a.db), os.Getenv("CHANGELOG_TOKEN")).
		OnPublish(func() { a.hub.BroadcastAll(wsevent.Marshal("changelog:update", struct{}{})) })
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		changelog.Routes(api, handler, a.authMiddleware)
	})
}
