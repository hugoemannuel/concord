package main

import (
	"os"

	"gin-quickstart/backend/internal/changelog"

	"github.com/gin-gonic/gin"
)

// wireChangelog: notas de cada versão, publicadas pelo deploy.
func (a *app) wireChangelog() {
	handler := changelog.NewHandler(changelog.NewRepository(a.db), os.Getenv("CHANGELOG_TOKEN"))
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		changelog.Routes(api, handler, a.authMiddleware)
	})
}
