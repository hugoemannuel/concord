package main

import (
	"path/filepath"

	"gin-quickstart/backend/internal/linkpreview"

	"github.com/gin-gonic/gin"
)

// wireLinkPreviews: prévia dos links do chat (cartão estilo Discord). As
// imagens ficam numa subpasta de UPLOADS_DIR, que a limpeza dos anexos não varre.
func (a *app) wireLinkPreviews() {
	images := mustStore(filepath.Join(a.uploadsDir, "link-previews"), "link previews dir")
	repository := linkpreview.NewRepository(a.db)
	service := linkpreview.NewService(repository, linkpreview.NewSafeClient(), images, a.uploadSpace)
	go linkpreview.NewJanitor(repository, images).Run(a.ctx)
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		linkpreview.Routes(api, linkpreview.NewHandler(service, images), a.authMiddleware)
	})
}
