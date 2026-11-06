package level

import (
	"context"
	"log"

	"gin-quickstart/backend/internal/platform/wsevent"
)

func (s *Service) give(ctx context.Context, g grant) {
	userID := g.activity.UserID
	xp := g.xp
	if xp == 0 {
		return
	}
	totalXP, totalSeconds, err := s.store.AddVoiceXP(ctx, userID, xp, g.minutes*60)
	if err != nil {
		log.Printf("[level] add xp for %s: %v", userID, err)
		return
	}

	progress := newProgress(userID, totalXP, totalSeconds)
	s.publisher.SendToUser(userID, wsevent.Marshal("level:update", progress))

	previous, _, _ := FromXP(totalXP - xp)
	if progress.Level == previous {
		return
	}
	event := wsevent.Marshal("level:up", LevelUpEvent{
		UserID:        userID,
		Level:         progress.Level,
		PreviousLevel: previous,
		CallID:        g.activity.CallID,
		ServerID:      g.activity.ServerID,
	})
	s.publisher.BroadcastToCall(g.activity.CallID, event)
	if g.activity.ServerID != nil {
		s.publisher.BroadcastToRoom("server:"+*g.activity.ServerID, event)
	}
	s.publisher.SendToUser(userID, event)
}
