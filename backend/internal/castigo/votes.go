package castigo

import (
	"context"
	"log"
	"time"

	"gin-quickstart/backend/internal/call"
	"gin-quickstart/backend/internal/platform/wsevent"
)

// sameCall: onde initiatorID está, se ele e targetID estão nesta call de canal.
func (s *Service) sameCall(callID, initiatorID, targetID string) (call.VoiceLocation, error) {
	loc, ok := s.calls.VoiceLocationOf(initiatorID)
	if !ok || loc.CallID != callID {
		return call.VoiceLocation{}, ErrNotInCall
	}
	if t, ok := s.calls.VoiceLocationOf(targetID); !ok || t.CallID != callID {
		return call.VoiceLocation{}, ErrNotInCall
	}
	return loc, nil
}

// StartVote abre a votação de castigo na call (qualquer membro que esteja nela).
func (s *Service) StartVote(ctx context.Context, callID, initiatorID string, req Request) (Vote, error) {
	if _, err := req.valid(); err != nil {
		return Vote{}, err
	}
	loc, err := s.sameCall(callID, initiatorID, req.UserID)
	if err != nil {
		return Vote{}, err
	}
	snap, err := s.snapshot(ctx, loc.ServerID)
	if err != nil {
		return Vote{}, err
	}
	if err := checkTarget(snap, initiatorID, req.UserID); err != nil {
		return Vote{}, err
	}
	voters := eligibleVoters(snap, s.calls.ParticipantIDs(callID), req.UserID)
	if len(voters) < minVoters {
		return Vote{}, ErrFewVoters
	}
	v, err := s.votes.open(&Vote{
		CallID: callID, ServerID: loc.ServerID, TargetID: req.UserID, InitiatorID: initiatorID,
		Effects: req.Effects, Duration: req.Duration, Voters: voters, channelID: loc.ChannelID,
	}, s.now())
	if err != nil {
		return Vote{}, err
	}
	s.announceVote(v)
	return v, nil
}

// CastVote registra o voto; com a maioria, o castigo passa a valer.
func (s *Service) CastVote(ctx context.Context, callID, voteID, voterID string, yes bool) (Vote, error) {
	v, err := s.votes.cast(callID, voteID, voterID, yes, s.now())
	if err != nil {
		return Vote{}, err
	}
	s.announceVote(v)
	if v.Status == VotePassed {
		s.applyVote(ctx, v)
	}
	return v, nil
}

// CurrentVote: a votação aberta na call, para quem está nela (quem reabriu o app).
func (s *Service) CurrentVote(callID, userID string) (Vote, bool) {
	if loc, ok := s.calls.VoiceLocationOf(userID); !ok || loc.CallID != callID {
		return Vote{}, false
	}
	return s.votes.current(callID)
}

// applyVote: o castigo aprovado vale como se quem abriu a votação o desse.
func (s *Service) applyVote(ctx context.Context, v Vote) {
	d, _ := duration(v.Duration)
	_, err := s.punish(ctx, punishment{
		serverID: v.ServerID, actorID: v.InitiatorID, channelID: v.channelID, d: d, byVote: true,
		req: Request{UserID: v.TargetID, Effects: v.Effects, Duration: v.Duration},
	})
	if err != nil {
		log.Printf("[castigo] aplicar a votação %s: %v", v.ID, err)
	}
}

func (s *Service) announceVote(v Vote) {
	s.pub.BroadcastToCall(v.CallID, wsevent.Marshal("castigo:vote", v))
}

// expireVotes avisa a call das votações que acabaram sem maioria.
func (s *Service) expireVotes(now time.Time) {
	for _, v := range s.votes.expired(now) {
		s.announceVote(v)
	}
}
