package channel

import (
	"context"
	"errors"
	"log"

	"gin-quickstart/backend/internal/conversation"
)

// Mensagens temporárias do canal (spec temporarias-servidor): o prazo vive em
// channels.disappearing_seconds; quem aplica a validade é o pacote message.

// ErrInvalidDisappearing: prazo fora da lista aceita.
var ErrInvalidDisappearing = errors.New("invalid disappearing interval")

// ValidChannelDisappearing diz se o prazo é 0 (desligar) ou 24 h, 7 dias ou 90 dias.
func ValidChannelDisappearing(seconds int) bool {
	switch seconds {
	case 0, 86400, 604800, 7776000:
		return true
	}
	return false
}

// ChannelNoticePoster grava o aviso de sistema no canal (message.Service). Entra
// por setter porque message importa channel.
type ChannelNoticePoster interface {
	PostChannelNotice(ctx context.Context, channelID, authorID, content string) error
}

// SetNoticePoster liga o aviso do prazo (no boot). actorName devolve o nome de
// quem editou o canal.
func (s *Service) SetNoticePoster(poster ChannelNoticePoster, actorName func(ctx context.Context, userID string) (string, error)) {
	s.noticePoster = poster
	s.actorName = actorName
}

// disappearingOf normaliza o prazo: nil e 0 são "desligado".
func disappearingOf(ch *Channel) int {
	if ch == nil || ch.DisappearingSeconds == nil {
		return 0
	}
	return *ch.DisappearingSeconds
}

// AnnounceDisappearing avisa no canal que o prazo mudou, em nome de quem editou.
// Só fala se o valor guardado mudou de fato. Falha no aviso é só registrada: a
// edição e o channel:update já saíram.
func (s *Service) AnnounceDisappearing(ctx context.Context, actorID string, before, after *Channel) {
	if s.noticePoster == nil || s.actorName == nil || disappearingOf(before) == disappearingOf(after) {
		return
	}
	name, err := s.actorName(ctx, actorID)
	if err != nil {
		log.Printf("channel: nome de quem trocou o prazo do canal %s: %v", after.ID, err)
		return
	}
	text := conversation.DisappearingNotice(name, after.DisappearingSeconds)
	if err := s.noticePoster.PostChannelNotice(ctx, after.ID, actorID, text); err != nil {
		log.Printf("channel: aviso do prazo no canal %s: %v", after.ID, err)
	}
}
