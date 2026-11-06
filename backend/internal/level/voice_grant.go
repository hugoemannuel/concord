package level

import (
	"context"
	"log"

	"gin-quickstart/backend/internal/platform/wsevent"
)

// giveAll grava o XP de todos que fecharam minuto numa escrita só e avisa
// cada um (progresso e, se subiu, a subida). Se a escrita falhar, o XP do
// minuto se perde, como antes.
func (s *Service) giveAll(ctx context.Context, grants []grant) {
	adds := voiceAdds(grants)
	if len(adds) == 0 {
		return
	}
	totals, err := s.store.AddVoiceXP(ctx, adds)
	if err != nil {
		log.Printf("[level] add xp (%d pessoas): %v", len(adds), err)
		return
	}
	for _, g := range grants {
		if t, ok := totals[g.activity.UserID]; ok {
			s.announce(g, t)
		}
	}
}

// voiceAdds: as somas a gravar; minuto que rendeu 0 XP fica de fora.
func voiceAdds(grants []grant) []voiceXP {
	var adds []voiceXP
	for _, g := range grants {
		if g.xp != 0 {
			adds = append(adds, voiceXP{userID: g.activity.UserID, xp: g.xp, seconds: g.minutes * 60})
		}
	}
	return adds
}

// announce avisa o progresso novo à pessoa e, se ela subiu de nível, a
// chamada, o servidor e ela mesma.
func (s *Service) announce(g grant, t voiceTotals) {
	userID := g.activity.UserID
	progress := newProgress(userID, t.xp, t.seconds)
	s.publisher.SendToUser(userID, wsevent.Marshal("level:update", progress))

	previous, _, _ := FromXP(t.xp - g.xp)
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
