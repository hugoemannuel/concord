package main

import (
	"context"
	"errors"
	"fmt"

	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/conversation"
	"gin-quickstart/backend/internal/friendship"
	"gin-quickstart/backend/internal/message"
)

// callInviteDM posta o convite para a call na DM entre quem convida e o amigo:
// abre a conversa (com as regras de DM, como bloqueio) e grava o cartão como
// mensagem do convidador.
type callInviteDM struct {
	conversations *conversation.Service
	messages      *message.Service
}

func (d callInviteDM) PostCallInvite(ctx context.Context, inviterID, inviteeID string, card call.InviteCard) error {
	conv, err := d.conversations.GetOrCreateWith(ctx, inviterID, inviteeID)
	if errors.Is(err, friendship.ErrCannotMessage) {
		// Membro do servidor que só aceita DM de amigos.
		return fmt.Errorf("abrir DM do convite: %w", call.ErrInviteeDMsClosed)
	}
	if err != nil {
		return fmt.Errorf("abrir DM do convite: %w", err)
	}
	_, err = d.messages.CreateCallInviteMessage(ctx, conv.ID, inviterID, message.CallInvite{
		CallID:      card.CallID,
		ChannelID:   card.ChannelID,
		ServerID:    card.ServerID,
		ChannelName: card.ChannelName,
		ServerName:  card.ServerName,
	})
	return err
}
