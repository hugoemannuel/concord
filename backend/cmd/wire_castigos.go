package main

import (
	"gin-quickstart/backend/internal/castigo"

	"github.com/gin-gonic/gin"
)

// wireCastigos: castigo nas calls (docs/adr/0063-castigo-na-call.md). Vem
// depois das chamadas (consulta quem está nelas e aplica o castigo na mídia).
func (a *app) wireCastigos() {
	svc := castigo.NewService(castigo.NewRepository(a.db), a.permissionService, a.callService, a.hub)
	svc.SetAudit(a.audit)
	must(svc.Warm(a.ctx), "não foi possível carregar os castigos")
	a.callService.SetCastigos(svc)
	go svc.RunSweeper(a.ctx, castigo.SweepEvery)

	handler := castigo.NewHandler(svc)
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		castigo.Routes(api, handler, a.authMiddleware)
	})
}
