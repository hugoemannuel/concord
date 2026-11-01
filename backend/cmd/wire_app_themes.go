package main

import (
	"path/filepath"

	"gin-quickstart/backend/internal/apptheme"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// wireAppThemes: os temas próprios da aparência do app de cada pessoa (ADR 0040)
// e a imagem de fundo deles (ADR 0043), numa pasta própria de UPLOADS_DIR com o
// mesmo upload do avatar.
func (a *app) wireAppThemes() {
	repo := apptheme.NewRepository(a.db)
	handler := apptheme.NewHandler(apptheme.NewService(repo))
	dir := filepath.Join(a.uploadsDir, apptheme.ImageDir)
	files := mustStore(dir, "app theme images dir")
	images := user.NewProfileHandler(nil, files, mustStore(filepath.Join(dir, "static"), "app theme images dir"), a.uploadSpace)
	go apptheme.NewImageJanitor(files, repo).Run(a.ctx)
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		apptheme.Routes(api, handler, a.authMiddleware)
		apptheme.ImageRoutes(api, apptheme.NewImageHandler(images), a.authMiddleware)
	})
}
