package main

import (
	"path/filepath"

	"gin-quickstart/backend/internal/appsound"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// wireAppSounds: os sons que o app toca para cada pessoa (pacote, volume,
// escolha por evento e áudio próprio; ADR 0035). Os arquivos ficam na pasta da
// mídia de perfil, fora da limpeza dos anexos.
func (a *app) wireAppSounds() {
	files := mustStore(filepath.Join(a.uploadsDir, user.ProfileMediaDir, appsound.FilesDir), "app sounds dir")
	handler := appsound.NewHandler(appsound.NewService(appsound.NewRepository(a.db)), files, a.uploadSpace)
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		appsound.Routes(api, handler, a.authMiddleware)
	})
}
