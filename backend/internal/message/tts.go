package message

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// Mensagens /tts (docs/adr/0012-tts-no-cliente.md): mensagem comum com
// messages.tts = true; o app de quem está na call de origem lê o texto em voz.
const (
	// TTSMaxLength: limite do texto falado, em caracteres.
	TTSMaxLength = 200
	// TTSCooldown: uma mensagem TTS por pessoa a cada 10 s (em qualquer sala).
	TTSCooldown = 10 * time.Second
)

var ErrTTSTooLong = errors.New("tts message is too long")

// TTSCooldownError: a pessoa mandou uma TTS há menos de TTSCooldown.
type TTSCooldownError struct {
	RetryAfter time.Duration
}

func (e *TTSCooldownError) Error() string {
	return fmt.Sprintf("tts cooldown: retry after %s", e.RetryAfter)
}

// normalizeTTSContent tira os espaços das pontas e aplica o limite.
func normalizeTTSContent(content string) (string, error) {
	text := strings.TrimSpace(content)
	switch {
	case text == "":
		return "", ErrContentRequired
	case utf8.RuneCountInString(text) > TTSMaxLength:
		return "", ErrTTSTooLong
	}
	return text, nil
}

// ttsCooldown guarda, em memória, a última TTS de cada pessoa. Reiniciar o
// processo zera tudo, sem problema.
type ttsCooldown struct {
	mu     sync.Mutex
	window time.Duration
	now    func() time.Time
	last   map[string]time.Time
}

func newTTSCooldown(window time.Duration, now func() time.Time) *ttsCooldown {
	return &ttsCooldown{window: window, now: now, last: make(map[string]time.Time)}
}

// Take marca a vez de userID e devolve 0; se ainda não pode, devolve quanto
// falta e não marca nada.
func (c *ttsCooldown) Take(userID string) time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	if last, ok := c.last[userID]; ok && now.Sub(last) < c.window {
		return c.window - now.Sub(last)
	}
	c.last[userID] = now
	if len(c.last) > 1024 {
		c.prune(now)
	}
	return 0
}

// prune não deixa o mapa crescer para sempre: limpa as janelas vencidas.
func (c *ttsCooldown) prune(now time.Time) {
	for k, t := range c.last {
		if now.Sub(t) >= c.window {
			delete(c.last, k)
		}
	}
}

// Release devolve a vez marcada por Take (a mensagem não chegou a sair).
func (c *ttsCooldown) Release(userID string) {
	c.mu.Lock()
	delete(c.last, userID)
	c.mu.Unlock()
}

// TTSCalls: o que o TTS precisa saber das calls para decidir quem ouve.
type TTSCalls interface {
	// IsVoiceChannel: o canal é de voz?
	IsVoiceChannel(ctx context.Context, channelID string) bool
	// VoiceChannelOf: o canal de voz (e o servidor) em que a pessoa está em call.
	VoiceChannelOf(userID string) (channelID, serverID string, ok bool)
}

// TTSService cria as mensagens TTS. Quem chama já conferiu a permissão.
type TTSService struct {
	store     inviteStore
	channels  ChannelResolver
	convs     ConversationResolver
	calls     TTSCalls
	publisher EventPublisher
	cooldown  *ttsCooldown
	slowmode  *Slowmode
}

func NewTTSService(repository *Repository, publisher EventPublisher, channels ChannelResolver, convs ConversationResolver, calls TTSCalls) *TTSService {
	return &TTSService{
		store:     repository,
		channels:  channels,
		convs:     convs,
		calls:     calls,
		publisher: publisher,
		cooldown:  newTTSCooldown(TTSCooldown, time.Now),
	}
}

// voiceTarget: o canal de voz cuja call ouve a TTS do canal (issue #384). No
// chat de um canal de voz é a call daquele canal; num canal de texto, a call
// em que o autor está, se for do mesmo servidor. nil = ninguém ouve.
func (s *TTSService) voiceTarget(ctx context.Context, channelID, serverID, authorID string) *string {
	if s.calls.IsVoiceChannel(ctx, channelID) {
		return &channelID
	}
	if voiceID, voiceServer, ok := s.calls.VoiceChannelOf(authorID); ok && voiceServer == serverID {
		return &voiceID
	}
	return nil
}

// SendToChannel posta a TTS no canal; o message:create vai para quem vê o
// canal e só a call de voiceTarget fala.
func (s *TTSService) SendToChannel(ctx context.Context, channelID, authorID, content string) (*Message, error) {
	return s.send(ctx, authorID, content, func(text string) (*Message, error) {
		if err := s.slowmode.Take(ctx, channelID, authorID); err != nil {
			return nil, err
		}
		msg, err := s.postToChannel(ctx, channelID, authorID, text)
		if err != nil {
			s.slowmode.Release(channelID, authorID)
		}
		return msg, err
	})
}

// SetSlowmode liga o modo lento dos canais (o mesmo das mensagens comuns).
func (s *TTSService) SetSlowmode(gate *Slowmode) { s.slowmode = gate }

// postToChannel grava a TTS no canal e publica o message:create.
func (s *TTSService) postToChannel(ctx context.Context, channelID, authorID, text string) (*Message, error) {
	serverID, _ := s.channels.ChannelServerID(ctx, channelID)
	msg := &Message{ID: uuid.New().String(), AuthorID: authorID, ChannelID: &channelID, Content: text, TTS: true,
		TTSVoiceChannelID: s.voiceTarget(ctx, channelID, serverID, authorID)}
	if err := s.store.Create(ctx, msg); err != nil {
		return nil, err
	}
	full, err := s.store.FindByID(ctx, msg.ID)
	if err != nil {
		return nil, err
	}
	s.publisher.PublishMessageCreate(CreateEvent{ChannelID: full.ChannelID, ServerID: serverID, Message: *full})
	return full, nil
}

// SendToConversation posta a TTS na DM (ou grupo).
func (s *TTSService) SendToConversation(ctx context.Context, conversationID, authorID, content string) (*Message, error) {
	return s.send(ctx, authorID, content, func(text string) (*Message, error) {
		msg := &Message{ID: uuid.New().String(), AuthorID: authorID, ConversationID: &conversationID, Content: text, TTS: true}
		return postToConversation(ctx, s.store, s.convs, s.publisher, msg)
	})
}

// send valida o texto, gasta a vez do cooldown e posta; se a mensagem não
// sair, a vez volta.
func (s *TTSService) send(ctx context.Context, authorID, content string, post func(text string) (*Message, error)) (*Message, error) {
	text, err := normalizeTTSContent(content)
	if err != nil {
		return nil, err
	}
	if wait := s.cooldown.Take(authorID); wait > 0 {
		return nil, &TTSCooldownError{RetryAfter: wait}
	}
	msg, err := post(text)
	if err != nil {
		s.cooldown.Release(authorID)
		return nil, err
	}
	return msg, nil
}
