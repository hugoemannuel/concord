package call

import (
	"context"
	"log"

	"gin-quickstart/backend/internal/platform/livekit"
)

// Castigo (docs/adr/0063-castigo-na-call.md): por um tempo, a pessoa não fala,
// não entra em call ou não ouve nos canais de voz de um servidor. Os castigos
// ficam no internal/castigo; aqui a chamada só consulta e aplica na mídia.

// Restriction: o que o castigo tira de alguém nas calls de um servidor agora.
type Restriction struct {
	NoSpeak   bool
	NoConnect bool
	NoListen  bool
}

// CastigoSource é o que a chamada usa dos castigos (castigo.Service).
type CastigoSource interface {
	// Restriction: o castigo de userID no servidor agora (zero se não tem).
	Restriction(serverID, userID string) Restriction
	// Punished: userID tem castigo em algum servidor (atalho que evita
	// procurar o servidor do canal a cada entrada).
	Punished(userID string) bool
}

// castigoError: entrar em call de castigo. Para o resto do app é um "sem
// CONNECT" (403), com a mensagem própria.
type castigoError struct{}

func (castigoError) Error() string {
	return "você está de castigo e não pode entrar em call neste servidor agora"
}

func (castigoError) Unwrap() error { return ErrNoConnect }

// ErrCastigo: a pessoa está de castigo sem poder entrar em call.
var ErrCastigo error = castigoError{}

// SetCastigos liga os castigos às chamadas de canal.
func (s *Service) SetCastigos(c CastigoSource) { s.castigos = c }

// castigoOf: a restrição de userID no servidor (zero sem castigos ligados ou
// fora de servidor).
func (s *Service) castigoOf(serverID, userID string) Restriction {
	if s.castigos == nil || serverID == "" {
		return Restriction{}
	}
	return s.castigos.Restriction(serverID, userID)
}

// limit tira da mídia o que o castigo proíbe.
func (r Restriction) limit(g livekit.Grant) livekit.Grant {
	g.NoSpeak = g.NoSpeak || r.NoSpeak
	g.NoSubscribe = g.NoSubscribe || r.NoListen
	return g
}

// castigoBlocksJoin: userID está de castigo sem poder entrar em call no
// servidor do canal. Só procura o canal de quem tem algum castigo.
func (s *Service) castigoBlocksJoin(ctx context.Context, channelID, userID string) bool {
	if s.castigos == nil || !s.castigos.Punished(userID) {
		return false
	}
	ch, err := s.findChannel(ctx, channelID)
	if err != nil {
		// Sem saber o servidor, quem tem castigo não entra (falha fechada).
		return true
	}
	return s.castigoOf(ch.ServerID, userID).NoConnect
}

// EnforceCastigo aplica na hora o castigo (ou o fim dele) a quem está numa
// call do servidor: sem poder entrar, sai da call; senão a mídia passa a
// refletir o que ele pode falar e ouvir.
func (s *Service) EnforceCastigo(ctx context.Context, serverID, userID string) {
	loc, ok := s.voiceLocationOf(userID)
	if !ok || loc.serverID != serverID {
		return
	}
	if s.castigoOf(serverID, userID).NoConnect {
		if err := s.kick(ctx, loc.callID, userID); err != nil {
			log.Printf("[call] castigo: remove %s from %s failed: %v", userID, loc.callID, err)
		}
		return
	}
	if s.media == nil {
		return
	}
	if err := s.media.UpdatePermissions(ctx, loc.callID, userID, s.GrantFor(ctx, loc.callID, userID)); err != nil {
		log.Printf("[call] castigo: update %s in %s failed: %v", userID, loc.callID, err)
	}
}
