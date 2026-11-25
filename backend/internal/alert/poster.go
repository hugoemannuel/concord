package alert

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"
)

// maxPerHour: teto de mensagens por canal numa hora. O que passar vai só para
// o log (o incidente é gravado do mesmo jeito e aparece no painel).
const maxPerHour = 10

var errNoChannel = errors.New("canal de alerta não existe")

// WriteFunc grava a mensagem de sistema no canal (message.Service.PostSystemNotice);
// mentionAll pinga todos do servidor (push).
type WriteFunc func(ctx context.Context, channelID, text string, mentionAll bool) error

// Poster escreve nos canais de alerta, com o teto por hora.
type Poster struct {
	channels map[ChannelKind]string
	write    WriteFunc
	now      func() time.Time

	mu   sync.Mutex
	sent map[ChannelKind][]time.Time
}

// NewPoster: channels é o id de cada canal (EnsureChannels).
func NewPoster(channels map[ChannelKind]string, write WriteFunc) *Poster {
	return &Poster{channels: channels, write: write, now: time.Now, sent: map[ChannelKind][]time.Time{}}
}

// SetChannels: os ids dos canais, depois de EnsureChannels.
func (p *Poster) SetChannels(channels map[ChannelKind]string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.channels = channels
}

func (p *Poster) channel(ch ChannelKind) (string, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	id, ok := p.channels[ch]
	return id, ok
}

func (p *Poster) Send(ctx context.Context, ch ChannelKind, level Level, text string) error {
	id, ok := p.channel(ch)
	if !ok {
		return fmt.Errorf("%w: %s", errNoChannel, ch)
	}
	if !p.allow(ch) {
		log.Printf("[alert] teto de %d mensagens por hora em %s; não postei: %s", maxPerHour, ch, text)
		return nil
	}
	return p.write(ctx, id, text, level == LevelCritical)
}

// allow: ainda cabe uma mensagem no canal nesta hora? (janela deslizante)
func (p *Poster) allow(ch ChannelKind) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := p.now()
	recent := p.sent[ch][:0]
	for _, at := range p.sent[ch] {
		if now.Sub(at) < time.Hour {
			recent = append(recent, at)
		}
	}
	if len(recent) >= maxPerHour {
		p.sent[ch] = recent
		return false
	}
	p.sent[ch] = append(recent, now)
	return true
}
