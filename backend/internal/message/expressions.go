package message

import (
	"context"
	"errors"
	"log"
	"strings"

	"gin-quickstart/backend/internal/expression"
)

// Emojis e figurinhas ao enviar: cada mensagem e reação passa pela regra do
// pacote expression (docs/adr/0054-emojis-de-outros-servidores.md).

var (
	ErrExternalExpression = expression.ErrForbidden
	errGuardFailed        = errors.New("failed to check emojis and stickers")
)

// ExpressionGuard: a regra de quem pode usar o quê (expression.Guard).
type ExpressionGuard interface {
	SanitizeContent(ctx context.Context, dest expression.Destination, userID, content string) (string, error)
	CheckSticker(ctx context.Context, dest expression.Destination, userID, stickerID string) error
	CheckReaction(ctx context.Context, dest expression.Destination, userID, emojiID string) error
}

// reactionLookup: a reação já está na mensagem?
type reactionLookup interface {
	HasReaction(ctx context.Context, messageID, emoji string) (bool, error)
}

// expressionUse aplica a regra; nil (testes de outras regras) deixa tudo passar.
type expressionUse struct {
	guard     ExpressionGuard
	reactions reactionLookup
}

func (s *Service) SetExpressionGuard(guard ExpressionGuard) {
	s.expressions = &expressionUse{guard: guard, reactions: s.repository}
}

// channelDestination: o canal e o servidor dele. Se a consulta do servidor
// falhar, o canal ainda garante que a permissão seja conferida.
func (s *Service) channelDestination(ctx context.Context, channelID string) expression.Destination {
	dest := expression.Destination{ChannelID: channelID}
	if s.channelResolver != nil {
		dest.ServerID, _ = s.channelResolver.ChannelServerID(ctx, channelID)
	}
	return dest
}

// message devolve o texto que pode mesmo sair (o que não pode vira :nome:) e
// recusa a figurinha que não pode.
func (u *expressionUse) message(ctx context.Context, dest expression.Destination, userID, content string, stickerID *string) (string, error) {
	if u == nil {
		return content, nil
	}
	clean, err := u.guard.SanitizeContent(ctx, dest, userID, content)
	if err != nil {
		log.Printf("[message] conferir emojis: %v", err)
		return "", errGuardFailed
	}
	if stickerID == nil {
		return clean, nil
	}
	return clean, stickerError(u.guard.CheckSticker(ctx, dest, userID, *stickerID))
}

func stickerError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, expression.ErrForbidden):
		return ErrExternalExpression
	case errors.Is(err, expression.ErrUnknownSticker):
		return ErrInvalidSticker
	}
	log.Printf("[message] conferir figurinha: %v", err)
	return errGuardFailed
}

// reaction: emoji Unicode sempre passa; somar-se à reação que já está na
// mensagem também (a pessoa não precisa ser da origem para repetir); o
// personalizado novo passa pela regra.
func (u *expressionUse) reaction(ctx context.Context, dest expression.Destination, messageID, userID, emoji string) error {
	id, custom := customEmojiID(emoji)
	if u == nil || !custom {
		return nil
	}
	present, err := u.reactions.HasReaction(ctx, messageID, emoji)
	if err != nil {
		log.Printf("[message] conferir reação: %v", err)
		return errGuardFailed
	}
	if present {
		return nil
	}
	return reactionGuardError(u.guard.CheckReaction(ctx, dest, userID, id))
}

func reactionGuardError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, expression.ErrForbidden):
		return ErrExternalExpression
	case errors.Is(err, expression.ErrUnknownEmoji):
		return ErrInvalidEmoji
	}
	log.Printf("[message] conferir reação: %v", err)
	return errGuardFailed
}

// customEmojiID: o id de uma reação "<:id>" já validada por ValidateEmoji.
func customEmojiID(emoji string) (string, bool) {
	id, ok := strings.CutPrefix(emoji, "<:")
	if !ok {
		return "", false
	}
	return strings.TrimSuffix(id, ">"), true
}
