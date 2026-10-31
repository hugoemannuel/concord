package main

import (
	"context"
	"log"
	"time"

	"gin-quickstart/backend/internal/auth"
	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/guest"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

// guestSweepEvery: de quanto em quanto tempo os acessos vencidos são encerrados.
const guestSweepEvery = 30 * time.Second

// wireGuests: convite de visitante para uma call (docs/adr/0017-visitante-na-call.md).
// Vem depois das chamadas (consulta e tira gente delas).
func (a *app) wireGuests() {
	dir := guestDirectory{channels: a.channelService, servers: a.serverService, users: a.userService, bans: server.ServerRepository(a.db)}
	a.guestService = guest.NewService(guest.NewRepository(a.db), a.permissionService, dir, a.callService, a.hub, a.authService)
	a.guestService.SetAudit(a.audit)
	must(a.guestService.Warm(a.ctx), "não foi possível carregar os acessos de visitante")
	a.callService.SetGuests(a.guestService)
	// Virou membro (convite do servidor ou outro caminho): deixa de ser visitante lá.
	a.serverService.OnMemberJoined(func(ctx context.Context, serverID string, member server.ServerMember) {
		a.guestService.MemberJoined(ctx, serverID, member.UserID)
	})
	go a.guestService.RunSweeper(a.ctx, guestSweepEvery)

	handler := guest.NewHandler(a.guestService)
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		guest.Routes(api, handler, guest.Middlewares{
			Auth:          a.authMiddleware,
			MemberOrGuest: a.memberOrGuest,
			OptionalAuth:  auth.OptionalAuthMiddleware(a.authService),
		})
	})
}

// appVisitors: quem é visitante agora num servidor. A mesa de áudio sobe antes
// dos visitantes; até o guest.Service existir, ninguém é.
type appVisitors struct{ a *app }

func (v appVisitors) HasGuestPass(serverID, userID string) bool {
	return v.a.guestService != nil && v.a.guestService.HasGuestPass(serverID, userID)
}

// guestDirectory: nomes e banimentos que o convite de visitante mostra ou confere.
type guestDirectory struct {
	channels *channel.Service
	servers  *server.Service
	users    *user.Service
	bans     *server.Repository
}

func (d guestDirectory) Channel(ctx context.Context, id string) (*channel.Channel, error) {
	return d.channels.FindByID(ctx, id)
}

func (d guestDirectory) Server(ctx context.Context, id string) guest.ServerInfo {
	srv, err := d.servers.FindByID(ctx, id)
	if err != nil {
		return guest.ServerInfo{}
	}
	return guest.ServerInfo{Name: srv.Name, IconURL: srv.IconURL}
}

func (d guestDirectory) DisplayName(ctx context.Context, userID string) string {
	u, err := d.users.FindByID(ctx, userID)
	if err != nil {
		return ""
	}
	return u.DisplayName
}

// IsBanned: na dúvida (erro no banco), trata como banido (falha fechada).
func (d guestDirectory) IsBanned(ctx context.Context, serverID, userID string) bool {
	banned, err := d.bans.IsBanned(ctx, serverID, userID)
	if err != nil {
		log.Printf("[guest] conferir banimento de %s em %s: %v", userID, serverID, err)
		return true
	}
	return banned
}
