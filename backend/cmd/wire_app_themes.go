package main

import (
	"gin-quickstart/backend/internal/apptheme"

	"github.com/gin-gonic/gin"
)

// wireAppThemes: os temas próprios da aparência do app de cada pessoa (ADR 0040).
func (a *app) wireAppThemes() {
	handler := apptheme.NewHandler(apptheme.NewService(apptheme.NewRepository(a.db)))
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		apptheme.Routes(api, handler, a.authMiddleware)
	})
}
