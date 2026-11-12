package main

import (
	"path/filepath"

	"gin-quickstart/backend/internal/linkpreview"
	"gin-quickstart/backend/internal/message"

	"github.com/gin-gonic/gin"
)

// wirePollImages: as imagens das respostas de enquete, baixadas pelo servidor
// (internal/message/poll_image.go). Ficam numa subpasta de UPLOADS_DIR, que a
// limpeza dos anexos não varre. Depende do messageService e do uploadSpace.
func (a *app) wirePollImages(repository *message.Repository) {
	files := mustStore(filepath.Join(a.uploadsDir, "poll-images"), "poll images dir")
	images := message.NewPollImages(linkpreview.NewSafeClient(), files, a.uploadSpace)
	a.messageService.SetPollImages(images)
	go message.NewPollImageJanitor(repository, files).Run(a.ctx)
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		message.PollImageRoutes(api, images)
	})
}
