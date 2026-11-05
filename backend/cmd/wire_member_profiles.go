package main

import (
	"context"
	"log"

	"gin-quickstart/backend/internal/memberprofile"
	"gin-quickstart/backend/internal/savedprofile"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// memberProfileEvents: perfil do servidor mudou → server:member:update com o
// membro relido (avatar, estilo e faixa efetivos, mais os campos sobrescritos).
type memberProfileEvents struct {
	members   *server.Repository
	publisher interface {
		PublishMemberUpdate(event server.MemberJoinEvent)
	}
}

func (e memberProfileEvents) PublishMemberProfile(ctx context.Context, serverID, userID string) {
	member, err := e.members.FindMemberByUserID(ctx, serverID, userID)
	if err != nil {
		log.Printf("[memberprofile] reler membro %s: %v", userID, err)
		return
	}
	e.publisher.PublishMemberUpdate(server.MemberJoinEvent{ServerID: serverID, Member: *member})
}

// wireMemberProfiles: perfil por servidor (issue #529, ADR 0051). A mídia usa o
// upload do perfil global e a limpeza por referência do ADR 0011: o perfil do
// servidor entra junto dos perfis salvos em "quem ainda usa este arquivo?".
func (a *app) wireMemberProfiles(saved *savedprofile.Repository) {
	repository := memberprofile.NewRepository(a.db)
	a.profileHandler.SetMediaKeeper(user.MediaKeepers{saved, repository})
	events := memberProfileEvents{members: server.ServerRepository(a.db), publisher: a.hub}
	service := memberprofile.NewService(repository, a.permissionService, events, a.profileHandler)
	go service.RunMediaSweep(a.ctx, memberprofile.SweepInterval)
	handler := memberprofile.NewHandler(service, a.profileHandler)

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		memberprofile.Routes(api, handler, a.authMiddleware)
	})
}
