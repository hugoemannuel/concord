package main

import (
	"context"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/platform/media"
	"gin-quickstart/backend/internal/server"

	"github.com/gin-gonic/gin"
)

// wireForward: encaminhar mensagens (docs/adr/0062-encaminhar-mensagens.md).
// Depende do roomAccess e do messageService montados pelo wireChat.
func (a *app) wireForward(repository *message.Repository, uploads *media.Store, events message.EventPublisher, slowmode *message.Slowmode) {
	dir := forwardDirectory{channels: a.channelService, servers: a.serverService}
	forwarder := message.NewForwarder(message.ForwarderDeps{
		Store:     repository,
		Files:     uploads,
		Space:     a.uploadSpace,
		Rooms:     message.NewForwardRooms(a.roomAccess, a.permissionService),
		Directory: dir,
		Comments:  a.messageService,
		Events:    message.NewRoomEvents(events, a.cachedChannels(), a.conversationRepository),
		Slowmode:  slowmode,
	})
	handler := message.NewForwardHandler(forwarder, message.NewForwardTargets(dir, a.permissionService))
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		message.ForwardRoutes(api, handler, a.authMiddleware)
	})
}

// forwardDirectory: os nomes da origem e os destinos possíveis, lidos dos
// serviços de canal e de servidor.
type forwardDirectory struct {
	channels *channel.Service
	servers  *server.Service
}

func (d forwardDirectory) ChannelOrigin(ctx context.Context, channelID string) (message.ForwardOrigin, error) {
	ch, err := d.channels.FindByID(ctx, channelID)
	if err != nil {
		return message.ForwardOrigin{}, err
	}
	origin := message.ForwardOrigin{ChannelName: ch.Name, ServerID: ch.ServerID}
	if srv, err := d.servers.FindByID(ctx, ch.ServerID); err == nil {
		origin.ServerName = srv.Name
	}
	return origin, nil
}

// UserServers e ServerChannels só traduzem; com erro a lista vem vazia junto dele.
func (d forwardDirectory) UserServers(ctx context.Context, userID string) ([]message.ForwardTargetServer, error) {
	servers, err := d.servers.ListByUserID(ctx, userID)
	out := make([]message.ForwardTargetServer, len(servers))
	for i, s := range servers {
		out[i] = message.ForwardTargetServer{ID: s.ID, Name: s.Name, IconURL: s.IconURL}
	}
	return out, err
}

func (d forwardDirectory) ServerChannels(ctx context.Context, serverID string) ([]message.ForwardChannelCandidate, error) {
	channels, err := d.channels.ListByServerID(ctx, serverID)
	out := make([]message.ForwardChannelCandidate, len(channels))
	for i, ch := range channels {
		out[i] = message.ForwardChannelCandidate{ID: ch.ID, Name: ch.Name, Type: ch.Type, System: ch.IsSystem}
	}
	return out, err
}
