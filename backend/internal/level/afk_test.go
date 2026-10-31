package level

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"gin-quickstart/backend/internal/call"
)

// afkCalls: ana e bia entraram em t0; o XP lê pelo call.AFK de verdade.
type afkCalls struct{ active []call.VoiceActivity }

func (f *afkCalls) IsParticipant(callID, _ string) bool    { return callID == "call-1" }
func (f *afkCalls) ActiveVoiceUsers() []call.VoiceActivity { return f.active }
func (f *afkCalls) CallSnapshots() []call.CallSnapshot     { return nil }

func xpWithAFK(clock *time.Time) (*Service, *fakeStore, *call.AFK) {
	s, store, _, _ := newTestService()
	src := &afkCalls{}
	for _, id := range []string{"ana", "bia"} {
		src.active = append(src.active, call.VoiceActivity{UserID: id, CallID: "call-1", JoinedAt: t0})
	}
	afk := call.NewAFK(src, func() time.Time { return *clock })
	s.voice = afk
	return s, store, afk
}

func TestVoiceXPStopsAfterTenMinutesWithoutSpeaking(t *testing.T) {
	clock := t0
	s, store, afk := xpWithAFK(&clock)

	// 20 min de call; a ana fala a cada 5 min, a bia nunca.
	for i := 0; i < 120; i++ {
		if i%30 == 0 {
			afk.HandleSpeaking("ana", json.RawMessage(`{"call_id":"call-1"}`))
		}
		clock = clock.Add(tickInterval)
		s.tick(context.Background(), clock)
	}

	// Enquanto a bia conta, a call tem duas pessoas elegíveis (rank D, x1,25);
	// quando ela cai por AFK, a ana fica sozinha e volta ao XP normal.
	if got, want := store.xp["ana"], int64((9*XPPerMinute*125+11*XPPerMinute*100)/100); got != want {
		t.Fatalf("ana (falando) = %d XP, want %d", got, want)
	}
	// A bia conta da entrada até os 10 min sem falar e para: o tick dos
	// 10:00 já não conta, então fecha 9 minutos (os 50 s do décimo se perdem).
	if got, want := store.xp["bia"], int64(9*XPPerMinute*125/100); got != want {
		t.Fatalf("bia (calada) = %d XP, want %d", got, want)
	}

	// Voltou a falar: conta de novo na hora.
	before := store.xp["bia"]
	afk.HandleSpeaking("bia", json.RawMessage(`{"call_id":"call-1"}`))
	for i := 0; i < 6; i++ {
		clock = clock.Add(tickInterval)
		s.tick(context.Background(), clock)
	}
	if got := store.xp["bia"] - before; got != int64(XPPerMinute*125/100) {
		t.Fatalf("bia depois de voltar a falar = +%d XP em 1 min, want %d", got, XPPerMinute*125/100)
	}
}
