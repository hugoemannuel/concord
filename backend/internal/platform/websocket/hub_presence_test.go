package websocket

import (
	"testing"

	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/user"
)

// Os bots não têm websocket, mas aparecem sempre online para todo mundo.
func TestBotsAreAlwaysOnline(t *testing.T) {
	h := NewHub()
	got := h.PresenceMap([]string{bot.UserID, bot.SalinhaBotID, "ana"})
	for _, id := range []string{bot.UserID, bot.SalinhaBotID} {
		if got[id] != user.StatusOnline {
			t.Errorf("bot %s: status = %q, want %q", id, got[id], user.StatusOnline)
		}
	}
	if got["ana"] != user.StatusOffline {
		t.Errorf("pessoa desconectada: status = %q, want %q", got["ana"], user.StatusOffline)
	}
	if s := h.EffectiveStatus(bot.UserID); s != user.StatusOnline {
		t.Errorf("EffectiveStatus(Maestro) = %q, want %q", s, user.StatusOnline)
	}
}
