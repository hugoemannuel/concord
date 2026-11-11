package message

import (
	"context"
	"fmt"
	"math"
	"sync"
	"time"

	"gin-quickstart/backend/internal/permission"
)

// Modo lento do canal (issue #586): cada membro manda uma mensagem a cada
// channels.slowmode_seconds. Quem tem Gerenciar mensagens ou Gerenciar canais
// fica isento (o dono e o Administrador têm tudo). A vez de cada um fica em
// memória, como o cooldown do /tts: reiniciar o processo só libera uma
// mensagem a mais. O intervalo de cada canal também: é lido do banco uma vez
// e atualizado pela edição do canal (SetSeconds), sem consulta a mais por
// mensagem.

const (
	// slowmodeMaxWindow: o maior intervalo aceito (6 h); vez mais velha já venceu.
	slowmodeMaxWindow = 6 * time.Hour
	// slowmodePruneAt: tamanho do mapa a partir do qual as vezes vencidas saem.
	slowmodePruneAt = 4096
	// slowmodeExempt: qualquer uma destas permissões no canal isenta.
	slowmodeExempt = permission.ManageMessages | permission.ManageChannels
)

// SlowmodeError: a pessoa mandou mensagem no canal há menos que o intervalo.
type SlowmodeError struct {
	RetryAfter time.Duration
}

// retryAfterSeconds: a espera em segundos inteiros, para cima (resposta 429).
func retryAfterSeconds(d time.Duration) int {
	return int(math.Ceil(d.Seconds()))
}

func (e *SlowmodeError) Error() string {
	return fmt.Sprintf("slowmode: retry after %s", e.RetryAfter)
}

// SlowmodeReader: o intervalo do modo lento do canal (channel.Repository).
type SlowmodeReader interface {
	SlowmodeSeconds(ctx context.Context, channelID string) (int, error)
}

type slowmodeKey struct {
	channelID string
	userID    string
}

// Slowmode decide se a mensagem pode sair agora. Compartilhado pelas
// mensagens comuns e pelo /tts do canal. nil = sem modo lento.
type Slowmode struct {
	channels SlowmodeReader
	perms    PermissionChecker
	now      func() time.Time

	mu      sync.Mutex
	last    map[slowmodeKey]time.Time
	seconds map[string]int // channelID -> intervalo já lido
}

func NewSlowmode(channels SlowmodeReader, perms PermissionChecker) *Slowmode {
	return &Slowmode{channels: channels, perms: perms, now: time.Now,
		last: make(map[slowmodeKey]time.Time), seconds: make(map[string]int)}
}

// Take marca a vez de userID no canal e devolve o horário marcado (zero =
// nada marcado: livre ou isento); se ainda não pode, devolve *SlowmodeError
// com quanto falta e não marca nada.
func (s *Slowmode) Take(ctx context.Context, channelID, userID string) (time.Time, error) {
	window := s.windowFor(ctx, channelID, userID)
	if window == 0 {
		return time.Time{}, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	key, now := slowmodeKey{channelID, userID}, s.now()
	if last, ok := s.last[key]; ok && now.Sub(last) < window {
		return time.Time{}, &SlowmodeError{RetryAfter: window - now.Sub(last)}
	}
	s.last[key] = now
	if len(s.last) > slowmodePruneAt {
		s.prune(now)
	}
	return now, nil
}

// windowFor: o intervalo que vale para a pessoa no canal (0 = livre). Sem
// conseguir ler o canal, não bloqueia: quem barra acesso é a permissão.
func (s *Slowmode) windowFor(ctx context.Context, channelID, userID string) time.Duration {
	if s == nil {
		return 0
	}
	seconds := s.channelSeconds(ctx, channelID)
	if seconds <= 0 {
		return 0
	}
	if perms, err := s.perms.ChannelPerms(ctx, channelID, userID); err == nil && perms&slowmodeExempt != 0 {
		return 0
	}
	return time.Duration(seconds) * time.Second
}

// channelSeconds: o intervalo do canal, do que já foi lido ou do banco. Erro
// ao ler não fica guardado (vale 0 desta vez).
func (s *Slowmode) channelSeconds(ctx context.Context, channelID string) int {
	s.mu.Lock()
	seconds, ok := s.seconds[channelID]
	s.mu.Unlock()
	if ok {
		return seconds
	}
	seconds, err := s.channels.SlowmodeSeconds(ctx, channelID)
	if err != nil {
		return 0
	}
	// Uma edição que chegou durante a leitura vence o valor lido.
	s.mu.Lock()
	defer s.mu.Unlock()
	if current, ok := s.seconds[channelID]; ok {
		return current
	}
	s.seconds[channelID] = seconds
	return seconds
}

// SetSeconds guarda o intervalo novo do canal (chamado quando o canal é editado).
func (s *Slowmode) SetSeconds(channelID string, seconds int) {
	if s == nil {
		return
	}
	s.mu.Lock()
	s.seconds[channelID] = seconds
	s.mu.Unlock()
}

// prune tira as vezes que já venceram em qualquer intervalo.
func (s *Slowmode) prune(now time.Time) {
	for k, t := range s.last {
		if now.Sub(t) >= slowmodeMaxWindow {
			delete(s.last, k)
		}
	}
}

// Run manda a mensagem na vez de userID no canal: marca a vez, chama send e,
// se send falhar, devolve a vez. Ainda sem vez: *SlowmodeError, sem chamar send.
func (s *Slowmode) Run(ctx context.Context, channelID, userID string, send func() (*Message, error)) (*Message, error) {
	takenAt, err := s.Take(ctx, channelID, userID)
	if err != nil {
		return nil, err
	}
	msg, err := send()
	if err != nil {
		s.Release(channelID, userID, takenAt)
	}
	return msg, err
}

// Release devolve a vez que Take marcou em `at` (a mensagem não chegou a
// sair). Se outro envio já marcou uma vez nova, ela fica.
func (s *Slowmode) Release(channelID, userID string, at time.Time) {
	if s == nil {
		return
	}
	key := slowmodeKey{channelID, userID}
	s.mu.Lock()
	if last, ok := s.last[key]; ok && last.Equal(at) {
		delete(s.last, key)
	}
	s.mu.Unlock()
}
