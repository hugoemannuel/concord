package main

import (
	"gin-quickstart/backend/internal/expression"

	"github.com/gin-gonic/gin"
)

// wireExpressions: a regra de usar emojis e figurinhas de outros servidores e a
// origem deles para quem recebe (ADR 0052).
func (a *app) wireExpressions() {
	repository := expression.NewRepository(a.db)
	a.messageService.SetExpressionGuard(expression.NewGuard(repository, a.permissionService))
	handler := expression.NewHandler(expression.NewResolver(repository))
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		expression.Routes(api, handler, a.authMiddleware)
	})
}
