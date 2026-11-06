package badge

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"gin-quickstart/backend/internal/call"
)

type fakeStore struct {
	mu      sync.Mutex
	stats   map[string]Stats
	unlocks map[string]Unlocks
	deltas  map[string]Delta
	synced  []string
	// Sessões gravadas no desligamento e as que o processo novo lê.
	savedSessions map[string]int64
	loadSessions  map[string]int64
	failAdd       bool
	addCalls      int
	// Contadores por categoria (DJ, Barulhento).
	counts map[string]map[string]int64
	// Dias de uso gravados ("id@dia") e falha na gravação (Sequência).
	activeDays []string
	failDays   bool
	// Vagas do Top 10 do nível 100, na ordem de chegada (ver top10_test.go).
	top10 []string
}

func newFakeStore() *fakeStore {
	return &fakeStore{stats: map[string]Stats{}, unlocks: map[string]Unlocks{}, deltas: map[string]Delta{}, counts: map[string]map[string]int64{}}
}

func (f *fakeStore) RecordActiveDay(_ context.Context, userIDs []string, day string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failDays {
		return errors.New("db down")
	}
	for _, id := range userIDs {
		f.activeDays = append(f.activeDays, id+"@"+day)
	}
	return nil
}

func (f *fakeStore) AddCount(_ context.Context, userID, category string, n int64) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.counts[userID] == nil {
		f.counts[userID] = map[string]int64{}
	}
	f.counts[userID][category] += n
	return f.counts[userID][category], nil
}

func (f *fakeStore) Stats(_ context.Context, userID string) (Stats, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.synced = append(f.synced, userID)
	s, ok := f.stats[userID]
	if !ok {
		return Stats{}, ErrUserNotFound
	}
	s.Top10Rank = f.top10RankLocked(userID)
	s.Top10Full = s.Top10Full || len(f.top10) >= Top10Slots
	return s, nil
}

func (f *fakeStore) Unlocks(_ context.Context, userID string) (Unlocks, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.unlocks[userID], nil
}

func (f *fakeStore) SaveUnlocks(_ context.Context, userID string, unlocks []Unlock) ([]Unlock, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.unlocks[userID] == nil {
		f.unlocks[userID] = Unlocks{}
	}
	var saved []Unlock
	for _, u := range unlocks {
		if f.unlocks[userID][u.Category] == nil {
			f.unlocks[userID][u.Category] = map[int]time.Time{}
		}
		if _, ok := f.unlocks[userID][u.Category][u.Tier]; ok {
			continue
		}
		f.unlocks[userID][u.Category][u.Tier] = u.At
		saved = append(saved, u)
	}
	return saved, nil
}

func (f *fakeStore) AddCallStats(_ context.Context, deltas map[string]Delta) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.addCalls++
	if f.failAdd {
		return errors.New("db down")
	}
	for userID, d := range deltas {
		f.deltas[userID] = d
	}
	return nil
}

func (f *fakeStore) SaveSessions(_ context.Context, sessions map[string]int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.savedSessions = sessions
	return nil
}

func (f *fakeStore) LoadSessions(_ context.Context, _ time.Duration) (map[string]int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.loadSessions, nil
}

type fakePublisher struct {
	events []UnlockEvent
}

func (f *fakePublisher) SendToUser(userID string, raw []byte) {
	var ev struct {
		Type    string      `json:"type"`
		Payload UnlockEvent `json:"payload"`
	}
	_ = json.Unmarshal(raw, &ev)
	if ev.Type == "badge:unlock" {
		f.events = append(f.events, ev.Payload)
	}
}

type fakeCalls struct{ snaps []call.CallSnapshot }

func (f *fakeCalls) CallSnapshots() []call.CallSnapshot { return f.snaps }

type fakeOnline struct{ ids []string }

func (f *fakeOnline) OnlineUserIDs() []string { return f.ids }

func newTestService() (*Service, *fakeStore, *fakePublisher, *fakeCalls, *fakeOnline) {
	st := newFakeStore()
	pub := &fakePublisher{}
	calls := &fakeCalls{}
	online := &fakeOnline{}
	s := &Service{
		store: st, publisher: pub, calls: calls, online: online,
		now:     func() time.Time { return now },
		tracker: newTracker(t0, time.UTC),
	}
	return s, st, pub, calls, online
}

func TestBadgesAnnouncesNewTiersOnlyOnce(t *testing.T) {
	s, st, pub, _, _ := newTestService()
	// Conta criada no corte: sem Pioneiro, sem idade.
	st.stats["ana"] = Stats{CreatedAt: FounderCutoff, MessagesSent: 60}

	res, err := s.Badges(context.Background(), "ana", "ana")
	if err != nil {
		t.Fatal(err)
	}
	// Só mensagens chegou ao tier 1: as outras categorias nem aparecem.
	if full, ok := res.Badges.([]Badge); !ok || len(full) != 1 || full[0].Category != "mensagens" || res.UserID != "ana" || !res.Self {
		t.Fatalf("response = %+v", res)
	}
	if len(pub.events) != 1 || len(pub.events[0].Unlocks) != 1 {
		t.Fatalf("events = %+v, want one unlock", pub.events)
	}
	got := pub.events[0].Unlocks[0]
	if got.Category != "mensagens" || got.Tier != 1 || got.TierName != "Puxa-assunto" || got.Rarity != RarityCommon {
		t.Fatalf("unlock = %+v", got)
	}

	if _, err := s.Badges(context.Background(), "ana", "ana"); err != nil {
		t.Fatal(err)
	}
	if len(pub.events) != 1 {
		t.Fatalf("second fetch announced again: %+v", pub.events)
	}
}

func TestBadgesUnknownUser(t *testing.T) {
	s, _, _, _, _ := newTestService()
	if _, err := s.Badges(context.Background(), "ana", "ghost"); err != ErrUserNotFound {
		t.Fatalf("err = %v, want ErrUserNotFound", err)
	}
}

func TestAnnounceSortsRarestFirst(t *testing.T) {
	s, st, pub, _, _ := newTestService()
	st.stats["ana"] = Stats{CreatedAt: FounderCutoff.Add(-time.Hour), MessagesSent: 60}
	if _, err := s.Badges(context.Background(), "ana", "ana"); err != nil {
		t.Fatal(err)
	}
	first := pub.events[0].Unlocks[0]
	if first.Category != "fundador" {
		t.Fatalf("first unlock = %+v, want the legendary Pioneiro", first)
	}
}

func TestAnnounceSortsMythicAboveLegendary(t *testing.T) {
	s, st, pub, _, _ := newTestService()
	st.stats["ana"] = Stats{CreatedAt: FounderCutoff.Add(-time.Hour), IsDev: true}
	if _, err := s.Badges(context.Background(), "ana", "ana"); err != nil {
		t.Fatal(err)
	}
	if first := pub.events[0].Unlocks[0]; first.Category != "criador" || first.Rarity != RarityMythic {
		t.Fatalf("first unlock = %+v, want the mythic Fundador", first)
	}
}

func TestTickFlushesCallStatsAndSyncs(t *testing.T) {
	s, st, _, calls, online := newTestService()
	st.stats["ana"] = Stats{CreatedAt: now}
	st.stats["bia"] = Stats{CreatedAt: now}
	st.stats["caio"] = Stats{CreatedAt: now}
	calls.snaps = []call.CallSnapshot{{
		CallID: "c1", Participants: []string{"ana", "bia"}, Listeners: []string{"ana", "bia"}, Voice: []string{"ana", "bia"}, ScreenSharers: []string{"ana"},
	}}
	online.ids = []string{"caio"}
	// O dia de uso de caio já foi gravado (Sequência): só a varredura o reavalia.
	s.days.fresh(t0.Add(flushEvery*tickInterval).Format(time.DateOnly), []string{"caio"})

	at := t0
	for i := 0; i < flushEvery; i++ {
		at = at.Add(tickInterval)
		s.tick(context.Background(), at)
	}
	if d := st.deltas["ana"]; d.Stream != 60 || d.PeakCallSize != 2 || d.LongestSession != 60 {
		t.Fatalf("ana delta = %+v", d)
	}
	synced := map[string]bool{}
	for _, id := range st.synced {
		synced[id] = true
	}
	if !synced["ana"] || !synced["bia"] {
		t.Fatalf("synced = %v, want the people in call", st.synced)
	}
	if synced["caio"] {
		t.Fatalf("caio synced before the online sweep: %v", st.synced)
	}

	st.synced = nil
	for i := flushEvery; i < onlineSweepEvery; i++ {
		at = at.Add(tickInterval)
		s.tick(context.Background(), at)
	}
	found := false
	for _, id := range st.synced {
		found = found || id == "caio"
	}
	if !found {
		t.Fatalf("online sweep did not sync caio: %v", st.synced)
	}
}

func TestOthersSeeOnlyEarnedTiersAndDays(t *testing.T) {
	s, st, _, _, _ := newTestService()
	st.stats["ana"] = Stats{
		CreatedAt: now.AddDate(0, -2, 0), MessagesSent: 2345, NightSeconds: 7200, OwnedServers: 2,
		VoiceSeconds: 30 * hour,
	}
	res, err := s.Badges(context.Background(), "bia", "ana")
	if err != nil {
		t.Fatal(err)
	}
	if res.Self {
		t.Fatal("bia is not ana")
	}
	raw, _ := json.Marshal(res)
	var body struct {
		Badges []map[string]any `json:"badges"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	for _, b := range body.Badges {
		for _, leak := range []string{"value", "progress", "next_threshold", "next_tier_name", "next_at", "obtainable"} {
			if _, ok := b[leak]; ok {
				t.Fatalf("%s leaks %q: %v", b["category"], leak, b)
			}
		}
		if tier, _ := b["tier"].(float64); tier < 1 {
			t.Fatalf("unearned badge shown to others: %v", b)
		}
		if day, _ := b["unlocked_at"].(string); len(day) != len("2006-01-02") {
			t.Fatalf("unlocked_at = %q, want only the day", day)
		}
	}
	cats := map[string]bool{}
	for _, b := range body.Badges {
		cats[b["category"].(string)] = true
	}
	if !cats["mensagens"] || !cats["dono"] || !cats["voz"] || cats["streamer"] {
		t.Fatalf("categories = %v", cats)
	}
	if strings.Contains(string(raw), "2345") || strings.Contains(string(raw), "7200") {
		t.Fatalf("exact counts in the public view: %s", raw)
	}
}

func TestOwnerSeesWhatTheyEarned(t *testing.T) {
	s, st, _, _, _ := newTestService()
	st.stats["ana"] = Stats{CreatedAt: now.AddDate(0, -2, 0), MessagesSent: 2345, OwnedServers: 2}
	res, err := s.Badges(context.Background(), "ana", "ana")
	if err != nil {
		t.Fatal(err)
	}
	full := res.Badges.([]Badge)
	msgs := find(t, full, "mensagens")
	if msgs.Value != 2345 || msgs.NextThreshold == nil || msgs.Progress == 0 || msgs.UnlockedAt == nil {
		t.Fatalf("owner view = %+v", msgs)
	}
	if hasBadge(full, "festeiro") {
		t.Fatal("owner view must hide the categories without tier 1")
	}
}

func TestPublicDayUsesBrasilia(t *testing.T) {
	// 01:30 UTC do dia 25 ainda é dia 24 em Brasília.
	at := time.Date(2026, 10, 25, 1, 30, 0, 0, time.UTC)
	badges := []Badge{{Category: "voz", Tier: 1, UnlockedAt: &at, Tiers: []TierInfo{{Tier: 1, UnlockedAt: &at}, {Tier: 2}}}}
	pub := publicView(badges)
	if pub[0].UnlockedAt != "2026-10-24" || pub[0].Tiers[0].UnlockedAt != "2026-10-24" || pub[0].Tiers[1].UnlockedAt != "" {
		t.Fatalf("public view = %+v", pub[0])
	}
}

func TestAnnounceCountsBadgesNotTiers(t *testing.T) {
	// Primeiro deploy: 4 tiers de voz de uma vez viram um badge só (o maior).
	s, st, pub, _, _ := newTestService()
	st.stats["ana"] = Stats{CreatedAt: FounderCutoff, VoiceSeconds: 200 * hour, MessagesSent: 600}
	if _, err := s.Badges(context.Background(), "ana", "ana"); err != nil {
		t.Fatal(err)
	}
	got := pub.events[0].Unlocks
	if len(got) != 2 {
		t.Fatalf("unlocks = %+v, want one per category", got)
	}
	for _, u := range got {
		if u.Category == "voz" && u.TierName != "Podcaster" {
			t.Fatalf("voz announced as %q, want the highest (Podcaster)", u.TierName)
		}
		if u.Category == "mensagens" && u.Tier != 2 {
			t.Fatalf("mensagens announced tier %d, want 2", u.Tier)
		}
	}
}

func TestShutdownFlushesAndSavesSessions(t *testing.T) {
	s, st, _, calls, _ := newTestService()
	st.stats["ana"] = Stats{CreatedAt: now}
	st.stats["bia"] = Stats{CreatedAt: now}
	calls.snaps = []call.CallSnapshot{{
		CallID: "c1", Participants: []string{"ana", "bia"}, Listeners: []string{"ana", "bia"},
		Voice: []string{"ana", "bia"}, ScreenSharers: []string{"ana"},
	}}
	at := t0
	for i := 0; i < 3; i++ { // 30 s: ainda não deu o flush de 1 minuto
		at = at.Add(tickInterval)
		s.tick(context.Background(), at)
	}
	if len(st.deltas) != 0 {
		t.Fatalf("flushed too early: %+v", st.deltas)
	}
	s.shutdown()
	if d := st.deltas["ana"]; d.Stream != 30 || d.LongestSession != 30 {
		t.Fatalf("shutdown delta = %+v, want the 30 s not lost", d)
	}
	if st.savedSessions["ana"] != 30 || st.savedSessions["bia"] != 30 {
		t.Fatalf("saved sessions = %v", st.savedSessions)
	}
}

func TestStartResumesSavedSessions(t *testing.T) {
	s, st, _, calls, _ := newTestService()
	st.stats["ana"] = Stats{CreatedAt: now}
	st.stats["bia"] = Stats{CreatedAt: now}
	st.loadSessions = map[string]int64{"ana": 3 * 3600}
	s.resume(context.Background())
	calls.snaps = []call.CallSnapshot{{
		CallID: "c1", Participants: []string{"ana", "bia"}, Listeners: []string{"ana", "bia"}, Voice: []string{"ana", "bia"},
	}}
	at := t0
	for i := 0; i < flushEvery; i++ {
		at = at.Add(tickInterval)
		s.tick(context.Background(), at)
	}
	if got := st.deltas["ana"].LongestSession; got != 3*3600+60 {
		t.Fatalf("ana session after deploy = %d, want 3h + 60s", got)
	}
}

func TestFailedFlushIsRetried(t *testing.T) {
	s, st, _, calls, _ := newTestService()
	st.stats["ana"] = Stats{CreatedAt: now}
	calls.snaps = []call.CallSnapshot{{
		CallID: "c1", Participants: []string{"ana", "bia"}, Listeners: []string{"ana", "bia"}, ScreenSharers: []string{"ana"},
	}}
	st.failAdd = true
	at := t0
	for i := 0; i < flushEvery; i++ {
		at = at.Add(tickInterval)
		s.tick(context.Background(), at)
	}
	st.failAdd = false
	calls.snaps = nil
	for i := 0; i < flushEvery; i++ {
		at = at.Add(tickInterval)
		s.tick(context.Background(), at)
	}
	if got := st.deltas["ana"].Stream; got != 60 {
		t.Fatalf("stream after retry = %d, want the 60 s from the failed flush", got)
	}
}

// Um flush grava todo mundo numa escrita só.
func TestFlushWritesEveryoneAtOnce(t *testing.T) {
	s, st, _, calls, _ := newTestService()
	calls.snaps = []call.CallSnapshot{{
		CallID: "c1", Participants: []string{"ana", "bia"}, Listeners: []string{"ana", "bia"}, ScreenSharers: []string{"ana"},
	}}
	at := t0
	for i := 0; i < flushEvery; i++ {
		at = at.Add(tickInterval)
		s.tick(context.Background(), at)
	}
	if _, bia := st.deltas["bia"]; st.addCalls != 1 || st.deltas["ana"].Stream != 60 || !bia {
		t.Fatalf("escritas = %d, deltas = %+v; quer 1 com ana e bia", st.addCalls, st.deltas)
	}
}
