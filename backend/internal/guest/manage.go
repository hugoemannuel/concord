package guest

import (
	"context"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"

	"github.com/google/uuid"
)

// CreateInput: o que quem convida escolhe no modal.
type CreateInput struct {
	ChannelID string `json:"channel_id"`
	Duration  string `json:"duration"`
	CanSpeak  bool   `json:"can_speak"`
	CanStream bool   `json:"can_stream"`
}

func (in CreateInput) perms() int64 {
	var p int64
	if in.CanSpeak {
		p |= permission.Speak
	}
	if in.CanStream {
		p |= permission.Stream
	}
	return p
}

// voiceChannel: o canal existe e é de voz.
func (s *Service) voiceChannel(ctx context.Context, channelID string) (*channel.Channel, error) {
	ch, err := s.dir.Channel(ctx, channelID)
	if err != nil {
		return nil, ErrNotFound
	}
	if ch.Type != channel.TypeVoice {
		return nil, ErrNotVoiceChannel
	}
	return ch, nil
}

// channelPermsOf: as permissões do membro no canal (erro se não é membro).
func (s *Service) channelPermsOf(ctx context.Context, ch *channel.Channel, userID string) (int64, error) {
	snap, err := s.perms.Snapshot(ctx, ch.ServerID)
	if err != nil || !snap.IsMember(userID) {
		return 0, ErrNotMember
	}
	return snap.Channel(ch.ID, userID), nil
}

// requireManage: gerenciar os visitantes do canal (ver, revogar, expulsar) é de
// quem convida visitantes ou desconecta membros ali.
func (s *Service) requireManage(ctx context.Context, ch *channel.Channel, actorID string) error {
	perms, err := s.channelPermsOf(ctx, ch, actorID)
	if err != nil {
		return err
	}
	if perms&(permission.InviteGuests|permission.DisconnectMembers) == 0 {
		return ErrMissingPermission
	}
	return nil
}

// CreateInvite gera o link. Exige "Convidar visitantes" no canal e estar na
// call desse canal agora.
func (s *Service) CreateInvite(ctx context.Context, actorID string, in CreateInput) (*CreatedInvite, error) {
	ttl, ok := Durations[in.Duration]
	if !ok {
		return nil, ErrInvalidDuration
	}
	ch, err := s.voiceChannel(ctx, in.ChannelID)
	if err != nil {
		return nil, err
	}
	perms, err := s.channelPermsOf(ctx, ch, actorID)
	if err != nil {
		return nil, err
	}
	if !permission.Has(perms, permission.InviteGuests) {
		return nil, ErrMissingPermission
	}
	if loc, in := s.calls.VoiceLocationOf(actorID); !in || loc.ChannelID != ch.ID {
		return nil, ErrNotInCall
	}
	now := s.now()
	token := newToken()
	inv := &Invite{ID: uuid.NewString(), ServerID: ch.ServerID, ChannelID: ch.ID, CreatedBy: actorID, Permissions: in.perms(), ExpiresAt: now.Add(ttl), CreatedAt: now}
	if err := s.store.CreateInvite(ctx, inv, hashToken(token)); err != nil {
		return nil, err
	}
	s.record(ctx, inviteEvent(audit.GuestInviteCreate, actorID, inv, createdChanges(in)))
	return &CreatedInvite{Invite: *inv, Token: token}, nil
}

// ListInvites: os links ativos do canal e quem entrou por cada um.
func (s *Service) ListInvites(ctx context.Context, actorID, channelID string) ([]InviteSummary, error) {
	ch, err := s.voiceChannel(ctx, channelID)
	if err != nil {
		return nil, err
	}
	if err := s.requireManage(ctx, ch, actorID); err != nil {
		return nil, err
	}
	invites, err := s.store.InvitesOfChannel(ctx, ch.ID, s.now())
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(invites))
	for i, inv := range invites {
		ids[i] = inv.ID
	}
	guests, err := s.store.GuestsOf(ctx, ids)
	if err != nil {
		return nil, err
	}
	return summarize(invites, guests), nil
}

// summarize junta cada convite com os visitantes dele.
func summarize(invites []Invite, guests []InviteGuest) []InviteSummary {
	out := make([]InviteSummary, len(invites))
	pos := make(map[string]int, len(invites))
	for i, inv := range invites {
		out[i] = InviteSummary{Invite: inv, CanSpeak: inv.Permissions&permission.Speak != 0, CanStream: inv.Permissions&permission.Stream != 0, Guests: []InviteGuest{}}
		pos[inv.ID] = i
	}
	for _, g := range guests {
		if i, ok := pos[g.InviteID]; ok {
			out[i].Guests = append(out[i].Guests, g)
		}
	}
	return out
}

// RevokeInvite fecha o link e encerra o acesso de todos que entraram por ele.
func (s *Service) RevokeInvite(ctx context.Context, actorID, inviteID string) error {
	inv, err := s.store.InviteByID(ctx, inviteID)
	if err != nil {
		return ErrNotFound
	}
	ch, err := s.voiceChannel(ctx, inv.ChannelID)
	if err != nil {
		return err
	}
	if err := s.requireManage(ctx, ch, actorID); err != nil {
		return err
	}
	if err := s.store.RevokeInvite(ctx, inv.ID, s.now()); err != nil {
		return err
	}
	s.record(ctx, inviteEvent(audit.GuestInviteDelete, actorID, inv, nil))
	for _, p := range s.active.matching(func(p Pass) bool { return p.InviteID == inv.ID }) {
		s.end(ctx, p, EndRevoked)
	}
	return nil
}

// EndGuest expulsa o visitante: o acesso dele no servidor acaba (sai da call e
// não volta pelo link). Vale para quem gerencia visitantes no canal em que ele
// está agora.
func (s *Service) EndGuest(ctx context.Context, actorID, serverID, guestID string) error {
	p, ok := s.active.inServer(guestID, serverID, s.now())
	if !ok {
		return ErrNotFound
	}
	ch, err := s.voiceChannel(ctx, p.ChannelID)
	if err != nil {
		return err
	}
	if err := s.requireManage(ctx, ch, actorID); err != nil {
		return err
	}
	s.end(ctx, p, EndRemoved)
	s.record(ctx, audit.Event{
		ServerID: serverID, ActorID: actorID, Action: audit.GuestRemove,
		TargetType: audit.TargetMember, TargetID: guestID, ChannelID: p.ChannelID,
	})
	return nil
}
