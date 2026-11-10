package main

import (
	"context"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/message"
)

// wireSlowmode: o modo lento dos canais (issue #586), um só para as mensagens
// comuns e o /tts. A edição do canal atualiza o intervalo guardado nele.
func (a *app) wireSlowmode() *message.Slowmode {
	slowmode := message.NewSlowmode(a.channelRepository, a.permissionService)
	a.channelService.OnUpdated(func(_ context.Context, ch *channel.Channel) {
		slowmode.SetSeconds(ch.ID, ch.SlowmodeSeconds)
	})
	return slowmode
}
