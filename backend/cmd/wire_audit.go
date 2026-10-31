package main

import (
	"context"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/server"

	"github.com/gin-gonic/gin"
)

// wireAudit: a leitura do registro de auditoria (só com VIEW_AUDIT_LOG), a
// retenção de 90 dias e a entrada de membros. Cada área liga o a.audit nos
// próprios serviços.
func (a *app) wireAudit() {
	handler := audit.NewHandler(audit.NewService(a.auditRepository, a.permissionService))
	go audit.NewRetention(a.auditRepository).Run(a.ctx)

	a.serverService.OnMemberJoined(func(ctx context.Context, serverID string, member server.ServerMember) {
		a.audit.Record(ctx, audit.Event{
			ServerID: serverID, ActorID: member.UserID, Action: audit.MemberJoin,
			TargetType: audit.TargetMember, TargetID: member.UserID,
		})
	})

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		audit.Routes(api, handler, a.authMiddleware)
	})
}
