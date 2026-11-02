package main

import (
	"gin-quickstart/backend/internal/plugin"

	"github.com/gin-gonic/gin"
)

// wirePlugins: catálogo de plugins da comunidade, instalação por servidor e
// escolha de cada membro. O time que aprova vem de TECH_TEAM_USER_IDS.
func (a *app) wirePlugins() {
	service := plugin.NewService(plugin.NewRepository(a.db), a.permissionService, a.hub, envList("TECH_TEAM_USER_IDS"))
	handler := plugin.NewHandler(service)

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		plugin.Routes(api, handler, a.authMiddleware, a.requireVerified)
	})
}
