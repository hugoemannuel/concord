package call

import (
	"context"
	"errors"
)

// Quem pode ser convidado para a call: um amigo de quem convida ou um membro
// do servidor da call (mesmo sem amizade). Bloqueio e acesso ao canal valem
// para os dois; a DM do membro segue as regras de DM (ele pode tê-la fechado).

// ErrInviteeDMsClosed: a DM com o convidado não pôde ser aberta porque ele só
// aceita mensagem de amigos (o poster traduz o erro de DM para este).
var ErrInviteeDMsClosed = errors.New("o convidado não aceita mensagem de quem não é amigo")

// FriendChecker é o que a chamada usa do friendship.Service.
type FriendChecker interface {
	AreFriends(ctx context.Context, a, b string) (bool, error)
}

// MemberChecker é o que a chamada usa do server.Service.
type MemberChecker interface {
	IsMember(ctx context.Context, serverID, userID string) (bool, error)
}

// SetFriendChecker liga a checagem de amizade dos convites.
func (s *Service) SetFriendChecker(f FriendChecker) { s.invite.friends = f }

// SetMemberChecker liga a checagem de membro do servidor da call.
func (s *Service) SetMemberChecker(m MemberChecker) { s.invite.members = m }

// inviteeEligibility: vínculo (amigo ou membro), bloqueio e acesso ao canal.
// Presença não conta: o convite fica salvo na DM e a pessoa vê quando voltar.
func (s *Service) inviteeEligibility(ctx context.Context, ic inviteContext, inviteeID string) string {
	if !s.isFriend(ctx, ic.inviter.ID, inviteeID) && !s.isCallServerMember(ctx, ic.serverID, inviteeID) {
		return InviteNotFriend
	}
	if s.blockedCheck != nil {
		if blocked, err := s.blockedCheck(ctx, ic.inviter.ID, inviteeID); err != nil || blocked {
			return InviteBlocked
		}
	}
	if s.requireConnect(ctx, ic.channelID, inviteeID) != nil {
		return InviteNoAccess
	}
	return ""
}

func (s *Service) isFriend(ctx context.Context, a, b string) bool {
	if s.invite.friends == nil {
		return false
	}
	ok, err := s.invite.friends.AreFriends(ctx, a, b)
	return err == nil && ok
}

func (s *Service) isCallServerMember(ctx context.Context, serverID *string, userID string) bool {
	if s.invite.members == nil || serverID == nil {
		return false
	}
	ok, err := s.invite.members.IsMember(ctx, *serverID, userID)
	return err == nil && ok
}

// postFailureStatus: o motivo de a DM não ter saído.
func postFailureStatus(err error) string {
	if errors.Is(err, ErrInviteeDMsClosed) {
		return InviteDMsClosed
	}
	return InviteFailed
}
