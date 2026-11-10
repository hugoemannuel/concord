package call

import "context"

// FriendChecker é o que a chamada usa do friendship.Service.
type FriendChecker interface {
	AreFriends(ctx context.Context, a, b string) (bool, error)
}

// SetFriendChecker liga a checagem de amizade dos convites.
func (s *Service) SetFriendChecker(f FriendChecker) { s.invite.friends = f }

// inviteeEligibility: amizade, bloqueio e acesso ao canal. Presença não conta:
// o convite fica salvo na DM e o amigo vê quando voltar.
func (s *Service) inviteeEligibility(ctx context.Context, ic inviteContext, inviteeID string) string {
	if s.invite.friends == nil {
		return InviteNotFriend
	}
	if ok, err := s.invite.friends.AreFriends(ctx, ic.inviter.ID, inviteeID); err != nil || !ok {
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
