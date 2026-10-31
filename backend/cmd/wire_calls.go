package main

import (
	"context"
	"errors"
	"log"
	"os"
	"time"

	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/platform/livekit"
	"gin-quickstart/backend/internal/soundboard"

	"github.com/gin-gonic/gin"
)

// wireCalls: LiveKit e o ciclo de vida das chamadas (a mídia nunca passa pelo Go).
func (a *app) wireCalls() {
	liveKitKey, liveKitSecret, err := liveKitCredentials()
	must(err, "")
	a.liveKitTokens = livekit.NewTokenIssuer(liveKitKey, liveKitSecret)
	a.liveKitPort = envOr("LIVEKIT_PORT", "7880")
	rtcProxy, err := livekit.NewRTCProxy("http://127.0.0.1:" + a.liveKitPort)
	must(err, "invalid LiveKit address")

	a.callService = call.CallService(call.CallRepository(a.db), a.hub, a.conversationService, a.serverService, a.channelService, a.userService, a.hub.IsOnline)
	a.callService.SetSoundLookup(soundboard.NewCallLookup(a.soundboardRepository, a.soundboardRepository))
	a.callService.SetPermissions(a.permissionService)
	a.liveKitAdmin = livekit.NewAdmin("http://127.0.0.1:"+a.liveKitPort, liveKitKey, liveKitSecret)
	a.callService.SetMediaAdmin(a.liveKitAdmin)
	// Mudou cargo ou canal: quem está em voz sem acesso sai; quem perdeu falar
	// ou transmitir tem a mídia atualizada na hora.
	a.hub.SetPermissionsChangedHook(func(serverID string) {
		a.callService.RevalidateServer(context.Background(), serverID)
	})
	// Expulso, banido ou saiu do servidor: sai da chamada de voz dele.
	a.moderationService.SetOnRemoved(a.callService.RemoveFromServerCalls)
	a.callService.SetBlockedCheck(a.friendshipService.IsBlockedEither)
	a.callService.SetFriendChecker(a.friendshipService)
	a.callService.SetPlaceSources(a.channelService, a.serverService)
	a.callService.SetInvitePoster(callInviteDM{conversations: a.conversationService, messages: a.messageService})
	// AFK: XP de voz e badges de call param depois de 10 min sem falar.
	a.callAFK = call.NewAFK(a.callService, time.Now)
	// Quem não está na sala de mídia não fica na lista da call (app reaberto
	// sem voltar, cliente travado).
	a.callPresence = call.NewMediaPresence(a.callService, a.liveKitAdmin, time.Now)
	// WS caído (troca de rede, reinício) não tira da call quem segue no LiveKit.
	a.callPresence.KeepWhoIsInMedia()
	go a.callPresence.Run(a.ctx, call.MediaSweepEvery)
	callHandler := call.CallHandler(a.callService, a.liveKitTokens)
	callHandler.SetAudit(a.audit, a.channelService)
	// Live pelo helper nativo: o participante "tela" de quem sai da chamada sai junto.
	a.callService.OnParticipantLeft(call.ScreenPublisherCleanup(a.liveKitAdmin))
	screenTokens := call.NewScreenTokenHandler(a.callService, a.liveKitTokens)
	// Reinício do servidor não derruba quem está em chamada. Sem conseguir
	// recarregar as chamadas o servidor não fica pronto (a porta nem abre):
	// tenta de novo por até 30 s e então desiste (o systemd reinicia e o
	// deploy volta ao binário anterior).
	must(restoreCalls(a.ctx, a.callService, 30*time.Second), "não foi possível recarregar as chamadas")

	a.route(func(router *gin.Engine, api *gin.RouterGroup) {
		call.CallRoutes(api, callHandler, a.authMiddleware, a.memberOrGuest)
		call.ScreenPublisherRoutes(api, screenTokens, a.authMiddleware)
		// Sinalização do LiveKit (auth pelo token do LiveKit em ?access_token=)
		router.Any("/rtc", rtcProxy)
		router.Any("/rtc/*path", rtcProxy)
	})
}

// liveKitCredentials: sem chave e segredo do LiveKit o backend não sobe.
func liveKitCredentials() (key, secret string, err error) {
	key, secret = os.Getenv("LIVEKIT_API_KEY"), os.Getenv("LIVEKIT_API_SECRET")
	if key == "" || secret == "" {
		return "", "", errors.New("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set")
	}
	return key, secret, nil
}

// restoreCalls repete RestoreActive até dar certo ou passar `wait`.
func restoreCalls(ctx context.Context, calls interface {
	RestoreActive(context.Context) error
}, wait time.Duration) error {
	deadline := time.Now().Add(wait)
	for {
		err := calls.RestoreActive(ctx)
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			return err
		}
		log.Printf("[call] restore falhou (%v); tentando de novo", err)
		select {
		case <-time.After(time.Second):
		case <-ctx.Done():
			return err
		}
	}
}
