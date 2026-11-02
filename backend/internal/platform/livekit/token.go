package livekit

import (
	"time"

	"github.com/livekit/protocol/auth"
	lk "github.com/livekit/protocol/livekit"
)

// tokenTTL cobre uma noite longa de chamada; o token só é usado para entrar
// na sala, então expirar no meio não derruba quem já está conectado.
const tokenTTL = 6 * time.Hour

// Grant restringe o que o participante pode fazer na mídia. O valor zero é o
// acesso completo, o que o canal de DM e quem tem todas as permissões recebem.
type Grant struct {
	NoSpeak     bool // sem SPEAK: não publica microfone
	NoStream    bool // sem STREAM: não publica câmera nem tela
	NoSubscribe bool // ensurdecido pelo servidor: não recebe áudio de ninguém
}

// Sources são as fontes que o participante pode publicar.
func (g Grant) Sources() []lk.TrackSource {
	sources := []lk.TrackSource{}
	if !g.NoSpeak {
		sources = append(sources, lk.TrackSource_MICROPHONE)
	}
	if !g.NoStream {
		sources = append(sources, lk.TrackSource_CAMERA, lk.TrackSource_SCREEN_SHARE, lk.TrackSource_SCREEN_SHARE_AUDIO)
	}
	return sources
}

// Permission é o mesmo grant no formato da API de administração (UpdateParticipant).
func (g Grant) Permission() *lk.ParticipantPermission {
	sources := g.Sources()
	return &lk.ParticipantPermission{
		CanSubscribe:      !g.NoSubscribe,
		CanPublish:        len(sources) > 0,
		CanPublishData:    true,
		CanPublishSources: sources,
	}
}

// roomToken é o token de entrada numa sala, com a configuração dela.
func (t *TokenIssuer) roomToken(identity, name string, grant *auth.VideoGrant) (string, error) {
	return auth.NewAccessToken(t.apiKey, t.apiSecret).
		SetIdentity(identity).
		SetName(name).
		SetValidFor(tokenTTL).
		SetVideoGrant(grant).
		ToJWT()
}

// TokenIssuer emite os JWTs que o cliente apresenta ao LiveKit para entrar
// na sala de uma chamada. A sala do LiveKit tem o mesmo ID da chamada.
type TokenIssuer struct {
	apiKey    string
	apiSecret string
}

func NewTokenIssuer(apiKey, apiSecret string) *TokenIssuer {
	return &TokenIssuer{
		apiKey:    apiKey,
		apiSecret: apiSecret,
	}
}

func (t *TokenIssuer) Issue(room, identity, name string, g Grant) (string, error) {
	canSubscribe, canPublishData := !g.NoSubscribe, true
	sources := g.Sources()
	canPublish := len(sources) > 0

	grant := &auth.VideoGrant{
		RoomJoin:       true,
		Room:           room,
		CanSubscribe:   &canSubscribe,
		CanPublish:     &canPublish,
		CanPublishData: &canPublishData,
	}
	grant.SetCanPublishSources(sources)
	return t.roomToken(identity, name, grant)
}

// IssueBot é o token do bot de música: entra na sala e só publica áudio
// (não assina ninguém — não escuta a call).
func (t *TokenIssuer) IssueBot(room, identity, name string) (string, error) {
	canPublish, canSubscribe := true, false
	return t.roomToken(identity, name, &auth.VideoGrant{
		RoomJoin:          true,
		Room:              room,
		CanPublish:        &canPublish,
		CanSubscribe:      &canSubscribe,
		CanPublishSources: []string{"microphone"},
	})
}

// IssueScreen é o token do participante "tela" (live pelo helper nativo,
// docs/adr/0031): entra na sala e só publica a tela e o som dela — não
// assina ninguém nem manda dados.
func (t *TokenIssuer) IssueScreen(room, identity, name string) (string, error) {
	canPublish, canSubscribe, canPublishData := true, false, false
	grant := &auth.VideoGrant{
		RoomJoin:       true,
		Room:           room,
		CanPublish:     &canPublish,
		CanSubscribe:   &canSubscribe,
		CanPublishData: &canPublishData,
	}
	grant.SetCanPublishSources([]lk.TrackSource{lk.TrackSource_SCREEN_SHARE, lk.TrackSource_SCREEN_SHARE_AUDIO})
	return t.roomToken(identity, name, grant)
}
