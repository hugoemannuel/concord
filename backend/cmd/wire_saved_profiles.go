package main

import (
	"gin-quickstart/backend/internal/savedprofile"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// wireSavedProfiles: perfis salvos (issue #344). Aplicar passa pelo
// ProfileService (avisa todo mundo como qualquer edição) e a mídia que um
// perfil salvo usa não é apagada na troca de avatar/banner (ADR 0011).
func (a *app) wireSavedProfiles(profiles *user.ProfileService) {
	repository := savedprofile.NewRepository(a.db)
	a.profileHandler.SetMediaKeeper(repository)
	handler := savedprofile.NewHandler(savedprofile.NewService(repository, a.userService, profiles), a.profileHandler, a.hub)

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		savedprofile.Routes(api, handler, a.authMiddleware)
	})
}
