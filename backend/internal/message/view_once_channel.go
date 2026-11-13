package message

import (
	"context"
	"sort"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"
)

// Visualização única no canal de servidor: quem pode abrir é quem vê o canal
// no momento do envio (o snapshot de permissões), menos o autor e os bots.

// ViewOnceChannelReader lê o canal do envio (channel.Service).
type ViewOnceChannelReader interface {
	FindByID(ctx context.Context, id string) (*channel.Channel, error)
}

type viewOnceChannelDeps struct {
	channels  ViewOnceChannelReader
	snapshots SnapshotLoader
}

// SetChannels liga o envio de visualização única nos canais. Sem ele, o canal
// recusa (ErrInvalidViewOnce).
func (s *ViewOnceService) SetChannels(channels ViewOnceChannelReader, snapshots SnapshotLoader) {
	s.channels = viewOnceChannelDeps{channels: channels, snapshots: snapshots}
}

// channelRecipients: os membros que veem o canal e leem o histórico agora,
// sem o autor e sem bots. O canal precisa aceitar visualização única.
func (s *ViewOnceService) channelRecipients(ctx context.Context, channelID, authorID string) ([]string, error) {
	if s.channels.channels == nil || s.channels.snapshots == nil {
		return nil, ErrInvalidViewOnce
	}
	ch, err := s.channels.channels.FindByID(ctx, channelID)
	if err != nil {
		return nil, err
	}
	if !acceptsViewOnce(ch) {
		return nil, ErrInvalidViewOnce
	}
	snap, err := s.channels.snapshots.Snapshot(ctx, ch.ServerID)
	if err != nil {
		return nil, err
	}
	ids := withoutIDs(channelReaders(snap, channelID), authorID)
	bots, err := s.repo.BotIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	return withoutIDs(ids, bots...), nil
}

// acceptsViewOnce: canal de texto ou voz, que não é de sistema e com a
// visualização única ligada.
func acceptsViewOnce(ch *channel.Channel) bool {
	if !ch.AllowViewOnce || ch.IsSystem {
		return false
	}
	return ch.Type == channel.TypeText || ch.Type == channel.TypeVoice
}

// channelReaders: membros do servidor com Ver canal e Ler histórico no canal,
// ordenados.
func channelReaders(snap *permission.Snapshot, channelID string) []string {
	var ids []string
	for userID := range snap.MemberRoles {
		if permission.Has(snap.Channel(channelID, userID), permission.ViewChannel|permission.ReadHistory) {
			ids = append(ids, userID)
		}
	}
	sort.Strings(ids)
	return ids
}
