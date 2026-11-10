package call

import (
	"context"
	"fmt"
	"testing"
)

// fakeMembers: "servidor:usuário" que são membros.
type fakeMembers map[string]bool

func (f fakeMembers) IsMember(_ context.Context, serverID, userID string) (bool, error) {
	return f[serverID+":"+userID], nil
}

// memberInviteService: a call da ana é no server-1; eli (não amiga) é membro dele.
func memberInviteService() (*Service, *fakePoster) {
	s, poster := inviteService(&fakePublisher{})
	srv := "server-1"
	s.calls["call-1"].info.ServerID = &srv
	s.SetMemberChecker(fakeMembers{"server-1:eli": true, "server-2:gabi": true})
	s.perms = fakeAccess{"bia": true, "eli": true, "gabi": true}
	return s, poster
}

func TestInviteServerMemberWhoIsNotFriend(t *testing.T) {
	s, poster := memberInviteService()

	res, err := s.InviteFriends(context.Background(), "call-1", "ana", []string{"bia", "eli"})
	if err != nil {
		t.Fatalf("InviteFriends: %v", err)
	}
	if statusOf(res, "bia") != InviteSent || statusOf(res, "eli") != InviteSent {
		t.Fatalf("res = %+v, want bia (amiga) e eli (membro) enviados", res)
	}
	if poster.postedTo("eli") != 1 {
		t.Fatalf("posts = %+v", poster.posts)
	}
}

func TestInviteRejectsMemberOfAnotherServer(t *testing.T) {
	s, poster := memberInviteService()

	res, _ := s.InviteFriends(context.Background(), "call-1", "ana", []string{"gabi"})
	if got := statusOf(res, "gabi"); got != InviteNotFriend {
		t.Fatalf("gabi (membro de outro servidor) = %q", got)
	}
	if len(poster.posts) != 0 {
		t.Fatalf("posts = %+v", poster.posts)
	}
}

func TestInviteMemberStillChecksBlockAndAccess(t *testing.T) {
	s, _ := memberInviteService()
	s.SetMemberChecker(fakeMembers{"server-1:eli": true, "server-1:hugo": true})
	s.blockedCheck = func(_ context.Context, _, b string) (bool, error) { return b == "eli", nil }

	res, _ := s.InviteFriends(context.Background(), "call-1", "ana", []string{"eli", "hugo"})
	if statusOf(res, "eli") != InviteBlocked || statusOf(res, "hugo") != InviteNoAccess {
		t.Fatalf("res = %+v", res)
	}
}

func TestInviteMemberWithClosedDMs(t *testing.T) {
	s, poster := memberInviteService()
	poster.err = fmt.Errorf("abrir DM do convite: %w", ErrInviteeDMsClosed)

	res, _ := s.InviteFriends(context.Background(), "call-1", "ana", []string{"eli"})
	if got := statusOf(res, "eli"); got != InviteDMsClosed {
		t.Fatalf("eli (DM fechada) = %q", got)
	}
	// A reserva é desfeita: dá para convidar de novo quando ela abrir a DM.
	poster.err = nil
	res, _ = s.InviteFriends(context.Background(), "call-1", "ana", []string{"eli"})
	if got := statusOf(res, "eli"); got != InviteSent {
		t.Fatalf("segunda tentativa = %q", got)
	}
}
