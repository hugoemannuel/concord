package main

import (
	"path/filepath"

	"gin-quickstart/backend/internal/emoji"

	"github.com/gin-gonic/gin"
)

// wireEmojis: emojis personalizados por servidor e o pack base (ADR 0028).
// O pack é buscado em segundo plano já no boot.
func (a *app) wireEmojis() {
	files := mustStore(filepath.Join(a.uploadsDir, "emojis"), "emojis uploads dir")
	handler := emoji.NewHandler(emoji.NewRepository(a.db), files, a.uploadSpace, a.permissionService, a.permissionService, a.authService, a.hub)
	handler.SetAudit(a.audit)
	base := emoji.NewBaseService(emoji.DefaultBaseURL)
	base.Warm()
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		emoji.Routes(api, handler, emoji.NewBaseHandler(base), a.authMiddleware)
	})
}
