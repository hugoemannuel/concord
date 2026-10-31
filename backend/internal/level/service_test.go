package level

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"gin-quickstart/backend/internal/call"
)

type fakeStore struct {
	xp map[string]int64
}

func (f *fakeStore) AddVoiceXP(_ context.Context, userID string, xp int64, seconds int64) (int64, int64, error) {
	f.xp[userID] += xp
	return f.xp[userID], 0, nil
}

type fakePublisher struct {
	mu     sync.Mutex
	sent   []string // "<alvo> <tipo>"
	boosts []BoostEvent
	// levelUps: só os level:up enviados à própria pessoa (um por subida).
	levelUps []LevelUpEvent
}

func (f *fakePublisher) record(target string, raw []byte) {
	var event struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	_ = json.Unmarshal(raw, &event)
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, target+" "+event.Type)
	if event.Type == "voice:boost" {
		var boost BoostEvent
		_ = json.Unmarshal(event.Payload, &boost)
		f.boosts = append(f.boosts, boost)
	}
	if event.Type == "level:up" && strings.HasPrefix(target, "user:") {
		var up LevelUpEvent
		_ = json.Unmarshal(event.Payload, &up)
		f.levelUps = append(f.levelUps, up)
	}
}

func (f *fakePublisher) SendToUser(userID string, event []byte)      { f.record("user:"+userID, event) }
func (f *fakePublisher) BroadcastToCall(callID string, event []byte) { f.record("call:"+callID, event) }
func (f *fakePublisher) BroadcastToRoom(room string, event []byte)   { f.record(room, event) }

type fakeVoice struct{ active []call.VoiceActivity }

func (f *fakeVoice) ActiveVoiceUsers() []call.VoiceActivity { return f.active }

var t0 = time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)

func newTestService(active ...string) (*Service, *fakeStore, *fakePublisher, *fakeVoice) {
	store := &fakeStore{xp: map[string]int64{}}
	pub := &fakePublisher{}
	voice := &fakeVoice{}
	serverID := "server-1"
	for _, id := range active {
		voice.active = append(voice.active, call.VoiceActivity{UserID: id, CallID: "call-1", ServerID: &serverID})
	}
	s := &Service{store: store, publisher: pub, voice: voice, pending: map[string]time.Duration{}, remainder: map[string]int64{}, lastBoost: map[string]int{}, lastTick: t0}
	return s, store, pub, voice
}

// run avança o relógio em ticks de 10 s.
func run(s *Service, from time.Time, ticks int) time.Time {
	now := from
	for i := 0; i < ticks; i++ {
		now = now.Add(tickInterval)
		s.tick(context.Background(), now)
	}
	return now
}

func TestXPOnlyForCompleteMinutes(t *testing.T) {
	s, store, _, _ := newTestService("ana")

	now := run(s, t0, 5) // 50 s
	if store.xp["ana"] != 0 {
		t.Fatalf("xp after 50s = %d, want 0", store.xp["ana"])
	}
	run(s, now, 1) // 60 s
	if store.xp["ana"] != XPPerMinute {
		t.Fatalf("xp after 60s = %d, want %d", store.xp["ana"], XPPerMinute)
	}
}

func TestMutingLosesThePartialMinute(t *testing.T) {
	s, store, _, voice := newTestService("ana")

	now := run(s, t0, 5) // 50 s falando
	active := voice.active
	voice.active = nil
	now = run(s, now, 1) // mutou
	voice.active = active
	run(s, now, 5) // mais 50 s

	if store.xp["ana"] != 0 {
		t.Fatalf("xp = %d, want 0 (the 50s before muting must not carry over)", store.xp["ana"])
	}
}

func TestLongPauseDoesNotGrantMissedTime(t *testing.T) {
	s, store, _, _ := newTestService("ana")

	s.tick(context.Background(), t0.Add(10*time.Minute))
	if store.xp["ana"] != 0 {
		t.Fatalf("xp after a 10 min stall = %d, want 0", store.xp["ana"])
	}
}

func TestLevelUpIsBroadcast(t *testing.T) {
	s, store, pub, _ := newTestService("ana")
	store.xp["ana"] = XPToNext(1) - XPPerMinute // falta 1 minuto para o nível 2

	run(s, t0, 6)

	want := map[string]bool{"call:call-1 level:up": false, "server:server-1 level:up": false, "user:ana level:up": false}
	for _, sent := range pub.sent {
		if _, ok := want[sent]; ok {
			want[sent] = true
		}
	}
	for target, seen := range want {
		if !seen {
			t.Errorf("missing %q in %v", target, pub.sent)
		}
	}
}

func TestNoLevelUpEventWithoutNewLevel(t *testing.T) {
	s, _, pub, _ := newTestService("ana")
	run(s, t0, 6)

	for _, sent := range pub.sent {
		if sent != "user:ana level:update" {
			t.Fatalf("unexpected event %q", sent)
		}
	}
}

// usersN devolve n nomes distintos ("ua", "ub"...).
func usersN(n int) []string {
	names := make([]string, n)
	for i := range names {
		names[i] = "u" + string(rune('a'+i))
	}
	return names
}

func TestBoostMultipliesXP(t *testing.T) {
	cases := []struct {
		users int
		want  int64
	}{
		{1, XPPerMinute},              // sem buff
		{2, XPPerMinute * 125 / 100},  // D (12,5 vira 12; o resto é carregado)
		{3, XPPerMinute * 150 / 100},  // C
		{4, XPPerMinute * 175 / 100},  // B (17,5 vira 17)
		{5, XPPerMinute * 200 / 100},  // A
		{6, XPPerMinute * 250 / 100},  // S
		{8, XPPerMinute * 300 / 100},  // SS
		{10, XPPerMinute * 400 / 100}, // SSS
	}
	for _, c := range cases {
		s, store, _, _ := newTestService(usersN(c.users)...)
		run(s, t0, 6) // 60 s = 1 minuto
		for _, name := range usersN(c.users) {
			if store.xp[name] != c.want {
				t.Errorf("%d pessoas: xp de %s = %d, want %d", c.users, name, store.xp[name], c.want)
			}
		}
	}
}

func TestBoostEventOnlyWhenBuffed(t *testing.T) {
	s, _, pub, _ := newTestService(usersN(1)...)
	run(s, t0, 6)

	if len(pub.boosts) != 0 {
		t.Fatalf("call sem buff recebeu voice:boost: %+v", pub.boosts)
	}
}

func TestBoostEventIsHeartbeatWhileBuffed(t *testing.T) {
	s, _, pub, _ := newTestService(usersN(4)...)
	run(s, t0, 3)

	if len(pub.boosts) != 3 {
		t.Fatalf("boosts = %d, want 1 por tick (3)", len(pub.boosts))
	}
	want := BoostEvent{CallID: "call-1", Percent: 175, Eligible: 4}
	for _, got := range pub.boosts {
		if got != want {
			t.Errorf("boost = %+v, want %+v", got, want)
		}
	}
}

func TestBoostEndIsAnnouncedOnce(t *testing.T) {
	s, _, pub, voice := newTestService(usersN(2)...)
	now := run(s, t0, 1)

	voice.active = voice.active[:1] // alguém mutou: sobra 1
	now = run(s, now, 1)
	run(s, now, 2) // sem buff: nada mais é enviado

	if len(pub.boosts) != 2 {
		t.Fatalf("boosts = %+v, want buff (125) e depois um único aviso de fim (100, 1 elegível)", pub.boosts)
	}
	if last := pub.boosts[1]; last.Percent != 100 || last.Eligible != 1 {
		t.Fatalf("boosts = %+v, want buff (125) e depois um único aviso de fim (100, 1 elegível)", pub.boosts)
	}
}

func TestBoostEndIsAnnouncedWhenCallDisappears(t *testing.T) {
	s, _, pub, voice := newTestService(usersN(4)...)
	now := run(s, t0, 1)

	voice.active = nil // todo mundo saiu/mutou
	run(s, now, 2)

	if len(pub.boosts) != 2 {
		t.Fatalf("boosts = %+v, want buff e depois um único aviso de fim", pub.boosts)
	}
	if last := pub.boosts[1]; last != (BoostEvent{CallID: "call-1", Percent: 100}) {
		t.Fatalf("boosts = %+v, want buff e depois um único aviso de fim", pub.boosts)
	}
}

func TestBoostStepChangePublishesNewPercent(t *testing.T) {
	s, _, pub, voice := newTestService(usersN(4)...)
	now := run(s, t0, 1)

	serverID := "server-1"
	for _, id := range usersN(6)[4:] { // entram mais 2: B (175) vira S (250)
		voice.active = append(voice.active, call.VoiceActivity{UserID: id, CallID: "call-1", ServerID: &serverID})
	}
	run(s, now, 1)

	if len(pub.boosts) != 2 {
		t.Fatalf("boosts = %+v, want 2 avisos", pub.boosts)
	}
	if got, want := pub.boosts[1], (BoostEvent{CallID: "call-1", Percent: 250, Eligible: 6}); got != want {
		t.Errorf("boost = %+v, want %+v", got, want)
	}
}

func TestBoostIsPublishedAgainAfterCallDisappears(t *testing.T) {
	s, _, pub, voice := newTestService(usersN(4)...)
	active := voice.active
	now := run(s, t0, 1)

	voice.active = nil
	now = run(s, now, 1)
	if len(s.lastBoost) != 0 {
		t.Fatalf("lastBoost = %v, want vazio depois que a call sumiu", s.lastBoost)
	}

	voice.active = active
	run(s, now, 1)

	if len(pub.boosts) != 3 {
		t.Fatalf("boosts = %+v, want buff, fim e buff de novo", pub.boosts)
	}
	if got, want := pub.boosts[2], (BoostEvent{CallID: "call-1", Percent: 175, Eligible: 4}); got != want {
		t.Errorf("boost = %+v, want %+v", got, want)
	}
}

func TestBoostIsPublishedBeforeXPIsSaved(t *testing.T) {
	s, _, pub, _ := newTestService(usersN(4)...)
	run(s, t0, 6)

	// O batimento do buff não espera a gravação do XP (que pode demorar).
	update := -1
	for i, sent := range pub.sent {
		if sent == "user:ua level:update" {
			update = i
			break
		}
	}
	if update < 0 {
		t.Fatalf("level:update não enviado: %v", pub.sent)
	}
	boostsBefore := 0
	for _, before := range pub.sent[:update] {
		if before == "call:call-1 voice:boost" {
			boostsBefore++
		}
	}
	if boostsBefore != 6 { // os 6 ticks, inclusive o que gravou o XP
		t.Fatalf("voice:boost antes do level:update = %d, want 6: %v", boostsBefore, pub.sent)
	}
}

// creditsPerMinute devolve o XP creditado a "ua" em cada um dos próximos minutos.
func creditsPerMinute(s *Service, store *fakeStore, minutes int) []int64 {
	var credited []int64
	now := t0
	for i := 0; i < minutes; i++ {
		before := store.xp["ua"]
		now = run(s, now, 6)
		credited = append(credited, store.xp["ua"]-before)
	}
	return credited
}

func TestBoostCarriesFractionalXP(t *testing.T) {
	cases := []struct {
		users int
		want  []int64
	}{
		{1, []int64{10, 10, 10, 10}},  // sem buff: nunca sobra resto
		{2, []int64{12, 13, 12, 13}},  // D: 12,5 por minuto
		{3, []int64{15, 15, 15, 15}},  // C: 15 exato
		{4, []int64{17, 18, 17, 18}},  // B: 17,5 por minuto
		{5, []int64{20, 20, 20, 20}},  // A
		{6, []int64{25, 25, 25, 25}},  // S
		{8, []int64{30, 30, 30, 30}},  // SS
		{10, []int64{40, 40, 40, 40}}, // SSS
	}
	for _, c := range cases {
		s, store, _, _ := newTestService(usersN(c.users)...)
		got := creditsPerMinute(s, store, len(c.want))
		for i := range c.want {
			if got[i] != c.want[i] {
				t.Errorf("%d pessoas: XP por minuto = %v, want %v", c.users, got, c.want)
				break
			}
		}
		if c.users == 1 && s.remainder["ua"] != 0 {
			t.Errorf("remainder sem buff = %d, want 0", s.remainder["ua"])
		}
	}
}

func TestRemainderIsDroppedWhenUserStopsBeingEligible(t *testing.T) {
	s, store, _, voice := newTestService(usersN(2)...)
	active := voice.active
	now := run(s, t0, 6)
	if store.xp["ua"] != 12 || s.remainder["ua"] != 50 {
		t.Fatalf("xp = %d, remainder = %d, want 12 e 50", store.xp["ua"], s.remainder["ua"])
	}

	voice.active = nil // mutou
	now = run(s, now, 1)
	if len(s.remainder) != 0 {
		t.Fatalf("remainder = %v, want vazio depois que saiu", s.remainder)
	}

	voice.active = active
	run(s, now, 6)
	if store.xp["ua"] != 24 { // 12 + 12: o 0,5 antigo não volta
		t.Fatalf("xp = %d, want 24", store.xp["ua"])
	}
}

func TestLevelUpUsesMultipliedXP(t *testing.T) {
	s, store, pub, _ := newTestService(usersN(2)...)
	// Faltam 11 XP: 10 (sem buff) não passa de nível, 12 (rank D) passa.
	store.xp["ua"] = XPToNext(1) - 11
	run(s, t0, 6)

	if len(pub.levelUps) != 1 {
		t.Fatalf("level:up = %+v, want 1 (só ua cruza o nível)", pub.levelUps)
	}
	up := pub.levelUps[0]
	if up.UserID != "ua" || up.PreviousLevel != 1 || up.Level != 2 {
		t.Errorf("level:up = %+v, want ua do nível 1 para o 2", up)
	}
}
