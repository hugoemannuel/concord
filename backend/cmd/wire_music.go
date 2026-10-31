package main

import (
	"context"

	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/music"

	"github.com/gin-gonic/gin"
)

// wireMusic: Maestro (bot de música), um player LiveKit por canal de voz.
func (a *app) wireMusic() {
	a.musicManager = music.NewManager(music.ConfigFromEnv(a.liveKitPort), music.ManagerDeps{
		Locate: func(userID string) (music.Location, bool) {
			l, ok := a.callService.VoiceLocationOf(userID)
			return music.Location{CallID: l.CallID, ChannelID: l.ChannelID, ServerID: l.ServerID}, ok
		},
		Humans:          a.callService.ParticipantIDs,
		Listeners:       a.callListeners,
		IsMember:        a.isServerMember,
		BotEnabled:      func(ctx context.Context, serverID string) bool { return a.isServerMember(ctx, serverID, bot.UserID) },
		ChannelName:     a.channelName,
		User:            a.musicUser,
		PostPublic:      a.postMusicMessage,
		SendToUser:      a.hub.SendToUser,
		BroadcastToCall: a.hub.BroadcastToCall,
		BroadcastToRoom: a.hub.BroadcastToRoom,
		Tokens:          a.liveKitTokens,
		Sessions:        music.NewSessionRepository(a.db),
	})
	a.callService.OnParticipantLeft(a.musicManager.OnParticipantLeft)
	a.callService.OnCallEnded(a.musicManager.OnCallEnded)
	a.serverService.OnMusicBotDisabled(a.musicManager.CloseServer)
	a.messageHandler.SetCommandHandler(a.musicManager)
	a.wireMusicCommands()
	a.wireMusicLinks()

	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		music.Routes(api, music.NewHandler(a.musicManager, a.authService), a.authMiddleware)
	})
}

// wireMusicSessions: o Maestro volta sozinho aos canais depois de o servidor
// reiniciar (docs/adr/0019-maestro-retoma-apos-reinicio.md). Roda depois de
// wireCalls (as calls já estão recarregadas); no desligamento grava onde cada
// player estava e o processo espera junto com os badges, antes de o banco fechar.
func (a *app) wireMusicSessions() {
	before := a.badgeDone
	done := make(chan struct{})
	go func() {
		defer close(done)
		a.musicManager.RunSessions(a.ctx)
		if before != nil {
			<-before
		}
	}()
	a.badgeDone = done
}

// callListeners: quem está ouvindo (não surdo) na call, pela mesma foto que
// os badges de call usam (call.CallSnapshot.Listeners).
func (a *app) callListeners(callID string) []string {
	for _, snap := range a.callService.CallSnapshots() {
		if snap.CallID == callID {
			return snap.Listeners
		}
	}
	return nil
}

func (a *app) isServerMember(ctx context.Context, serverID, userID string) bool {
	ok, err := a.permissionService.IsMember(ctx, serverID, userID)
	return err == nil && ok
}

func (a *app) channelName(ctx context.Context, channelID string) string {
	ch, err := a.channelService.FindByID(ctx, channelID)
	if err != nil {
		return ""
	}
	return ch.Name
}

func (a *app) musicUser(ctx context.Context, userID string) (music.UserRef, error) {
	u, err := a.userService.FindByID(ctx, userID)
	if err != nil {
		return music.UserRef{}, err
	}
	return music.UserRef{ID: u.ID, Username: u.Username, DisplayName: u.DisplayName, AvatarURL: u.AvatarURL}, nil
}

// postMusicMessage: as mensagens públicas do Maestro saem no canal "musica" do
// servidor; sem ele (não deveria ocorrer) ficam no canal onde o comando foi dado.
func (a *app) postMusicMessage(ctx context.Context, textChannelID, content string) error {
	if origin, err := a.channelService.FindByID(ctx, textChannelID); err == nil {
		if sys, err := a.channelService.SystemChannel(ctx, origin.ServerID); err == nil {
			textChannelID = sys.ID
		}
	}
	_, err := a.messageService.CreateSystemChannelMessage(ctx, textChannelID, bot.UserID, content, music.SystemKind)
	return err
}
