package main

import (
	"context"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/message"

	"github.com/gin-gonic/gin"
)

// wireTTS: mensagens /tts (docs/adr/0012-tts-no-cliente.md). Depende do
// roomAccess montado pelo wireChat.
func (a *app) wireTTS(messageRepository *message.Repository, slowmode *message.Slowmode) {
	tts := message.NewTTSService(messageRepository, a.hub, a.cachedChannels(), a.conversationRepository, ttsCalls{a})
	tts.SetSlowmode(slowmode)
	handler := message.NewTTSHandler(tts, a.permissionService, a.roomAccess)
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		message.TTSRoutes(api, handler, a.authMiddleware)
	})
}

// ttsCalls liga o TTS às calls e aos canais (resolvidos na hora de usar: o
// callService é montado depois do chat).
type ttsCalls struct{ a *app }

func (t ttsCalls) IsVoiceChannel(ctx context.Context, channelID string) bool {
	ch, err := t.a.channelService.FindByID(ctx, channelID)
	return err == nil && ch.Type == channel.TypeVoice
}

func (t ttsCalls) VoiceChannelOf(userID string) (string, string, bool) {
	loc, ok := t.a.callService.VoiceLocationOf(userID)
	return loc.ChannelID, loc.ServerID, ok
}
