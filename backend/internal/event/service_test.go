package event

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

var testNow = time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)

// fakeStore guarda tudo em memória; só o que o service usa.
type fakeStore struct {
	failUpdate  bool
	basicsCalls int
	updateCalls int
	events      map[string]*Event
	reminders   map[string][]ReminderRow
	rsvps       map[string]bool
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		events: map[string]*Event{}, reminders: map[string][]ReminderRow{},
		rsvps: map[string]bool{},
	}
}

func rsvpKey(eventID, userID string, occ time.Time) string {
	return eventID + "|" + userID + "|" + occ.UTC().Format(time.RFC3339)
}

func (f *fakeStore) Create(_ context.Context, e *Event, rows []ReminderRow) error {
	cp := *e
	f.events[e.ID] = &cp
	f.reminders[e.ID] = rows
	return nil
}

func (f *fakeStore) UpdateBasics(_ context.Context, e *Event) error {
	f.basicsCalls++
	cur := f.events[e.ID]
	cur.Title, cur.Description, cur.BannerID = e.Title, e.Description, e.BannerID
	return nil
}

func (f *fakeStore) Update(_ context.Context, e *Event, rows []ReminderRow) error {
	f.updateCalls++
	if f.failUpdate {
		return errors.New("banco fora")
	}
	cp := *e
	f.events[e.ID] = &cp
	f.reminders[e.ID] = rows
	return nil
}

func (f *fakeStore) Cancel(_ context.Context, serverID, eventID string) error {
	e, ok := f.events[eventID]
	if !ok || e.ServerID != serverID {
		return ErrEventNotFound
	}
	now := testNow
	e.CanceledAt = &now
	delete(f.reminders, eventID)
	return nil
}

func (f *fakeStore) Find(_ context.Context, serverID, eventID string) (*Event, error) {
	e, ok := f.events[eventID]
	if !ok || e.ServerID != serverID {
		return nil, ErrEventNotFound
	}
	cp := *e
	return &cp, nil
}

func (f *fakeStore) ListUpcoming(_ context.Context, serverID, _ string) ([]Event, error) {
	out := []Event{}
	for _, e := range f.events {
		if e.ServerID == serverID && e.CanceledAt == nil && e.FinishedAt == nil {
			out = append(out, *e)
		}
	}
	return out, nil
}

func (f *fakeStore) SetRSVP(_ context.Context, eventID, userID string, occ time.Time, going bool) error {
	f.rsvps[rsvpKey(eventID, userID, occ)] = going
	return nil
}

func (f *fakeStore) ClearRSVP(_ context.Context, eventID, userID string, occ time.Time) error {
	delete(f.rsvps, rsvpKey(eventID, userID, occ))
	return nil
}

func (f *fakeStore) ListGoing(_ context.Context, eventID string, occ time.Time) ([]Going, error) {
	out := []Going{}
	for k, going := range f.rsvps {
		if going && len(k) > len(eventID) && k[:len(eventID)] == eventID {
			out = append(out, Going{UserID: k})
		}
	}
	return out, nil
}

type fakeMembers map[string]bool

func (m fakeMembers) IsMember(_ context.Context, _, userID string) (bool, error) {
	return m[userID], nil
}

type published struct {
	room  string
	event map[string]any
}

type fakePublisher struct{ sent []published }

func (p *fakePublisher) BroadcastToRoom(room string, raw []byte) {
	var ev map[string]any
	_ = json.Unmarshal(raw, &ev)
	p.sent = append(p.sent, published{room: room, event: ev})
}

type env struct {
	svc    *Service
	store  *fakeStore
	pub    *fakePublisher
	access *fakeAccess
}

func newEnv() env {
	store := newFakeStore()
	pub := &fakePublisher{}
	access := newFakeAccess()
	access.actions["mod"] = AllActions // cargo com as três ações
	svc := NewService(store, access,
		fakeMembers{"dono": true, "mod": true, "membro": true, "a": true, "b": true, "c": true},
		pub)
	svc.now = func() time.Time { return testNow }
	return env{svc: svc, store: store, pub: pub, access: access}
}

func goodInput() Input {
	return Input{
		Title: "Noite", StartsAt: testNow.Add(time.Hour),
		Recurrence: RecWeekly, ReminderOffsets: []int{10, 5},
	}
}

func TestCreateNeedsTheCreatePermission(t *testing.T) {
	e := newEnv()
	if _, err := e.svc.Create(context.Background(), "s1", "membro", goodInput()); !errors.Is(err, ErrMissingPermission) {
		t.Fatalf("erro = %v, esperava ErrMissingPermission", err)
	}
	if len(e.store.events) != 0 || len(e.pub.sent) != 0 {
		t.Fatal("sem permissão não grava nem publica nada")
	}
}

func TestCreateStoresEventRemindersAndPublishes(t *testing.T) {
	e := newEnv()
	got, err := e.svc.Create(context.Background(), "s1", "mod", goodInput())
	if err != nil {
		t.Fatal(err)
	}
	if got.Scope != "server" || got.OccurrencesDone != 0 || !got.NextStartAt.Equal(got.StartsAt) {
		t.Errorf("evento = %+v", got)
	}
	rows := e.store.reminders[got.ID]
	if len(rows) != 3 || rows[0].OffsetMinutes != 10 || rows[1].OffsetMinutes != 5 || rows[2].OffsetMinutes != 0 {
		t.Errorf("avisos = %+v, esperava 10, 5 e 0", rows)
	}
	if len(e.pub.sent) != 1 || e.pub.sent[0].room != "server:s1" || e.pub.sent[0].event["type"] != "event:create" {
		t.Errorf("publicado = %+v", e.pub.sent)
	}
}

func TestUpdateMovesEventAndRebuildsReminders(t *testing.T) {
	e := newEnv()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", goodInput())
	e.store.events[created.ID].OccurrencesDone = 3

	in := goodInput()
	in.Title = "Outro nome"
	in.StartsAt = testNow.Add(48 * time.Hour)
	in.ReminderOffsets = []int{30}
	got, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", in)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Outro nome" || got.OccurrencesDone != 0 || !got.NextStartAt.Equal(in.StartsAt) {
		t.Errorf("evento = %+v", got)
	}
	rows := e.store.reminders[created.ID]
	if len(rows) != 2 || rows[0].OffsetMinutes != 30 || rows[1].OffsetMinutes != 0 {
		t.Errorf("avisos = %+v, esperava 30 e 0", rows)
	}
	if last := e.pub.sent[len(e.pub.sent)-1]; last.event["type"] != "event:update" {
		t.Errorf("último evento = %v", last.event["type"])
	}
}

func TestUpdateOfCanceledOrForeignEventIsNotFound(t *testing.T) {
	e := newEnv()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", goodInput())
	if _, err := e.svc.Update(context.Background(), "outro", created.ID, "mod", goodInput()); !errors.Is(err, ErrEventNotFound) {
		t.Errorf("de outro servidor = %v", err)
	}
	if err := e.svc.Cancel(context.Background(), "s1", created.ID, "mod"); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", goodInput()); !errors.Is(err, ErrEventNotFound) {
		t.Errorf("cancelado = %v", err)
	}
}

func TestCancelPublishesDeleteAndNeedsPermission(t *testing.T) {
	e := newEnv()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", goodInput())
	if err := e.svc.Cancel(context.Background(), "s1", created.ID, "membro"); !errors.Is(err, ErrMissingPermission) {
		t.Fatalf("membro cancelando = %v", err)
	}
	if err := e.svc.Cancel(context.Background(), "s1", created.ID, "mod"); err != nil {
		t.Fatal(err)
	}
	last := e.pub.sent[len(e.pub.sent)-1]
	payload, _ := last.event["payload"].(map[string]any)
	if last.event["type"] != "event:delete" || payload["event_id"] != created.ID || payload["server_id"] != "s1" {
		t.Errorf("publicado = %+v", last)
	}
}

func TestRSVPUsesCurrentOccurrenceAndNeedsMembership(t *testing.T) {
	e := newEnv()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", goodInput())
	if err := e.svc.SetRSVP(context.Background(), "s1", created.ID, "estranho", true); !errors.Is(err, ErrNotMember) {
		t.Fatalf("não membro = %v", err)
	}
	if err := e.svc.SetRSVP(context.Background(), "s1", created.ID, "membro", true); err != nil {
		t.Fatal(err)
	}
	if going, ok := e.store.rsvps[rsvpKey(created.ID, "membro", created.NextStartAt)]; !ok || !going {
		t.Errorf("resposta não foi gravada na ocorrência atual: %+v", e.store.rsvps)
	}
	if err := e.svc.ClearRSVP(context.Background(), "s1", created.ID, "membro"); err != nil {
		t.Fatal(err)
	}
	if len(e.store.rsvps) != 0 {
		t.Errorf("ClearRSVP deixou resposta: %+v", e.store.rsvps)
	}
}

func TestRSVPPublishesTheNewGoingCount(t *testing.T) {
	e := newEnv()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", goodInput())
	if err := e.svc.SetRSVP(context.Background(), "s1", created.ID, "membro", true); err != nil {
		t.Fatal(err)
	}
	assertGoingCount(t, e.pub, created.ID, 1)
	if err := e.svc.ClearRSVP(context.Background(), "s1", created.ID, "membro"); err != nil {
		t.Fatal(err)
	}
	assertGoingCount(t, e.pub, created.ID, 0)
}

func assertGoingCount(t *testing.T, pub *fakePublisher, eventID string, want float64) {
	t.Helper()
	last := pub.sent[len(pub.sent)-1]
	payload, _ := last.event["payload"].(map[string]any)
	if last.room != "server:s1" || last.event["type"] != "event:rsvp" ||
		payload["event_id"] != eventID || payload["going_count"] != want {
		t.Fatalf("publicado = %+v, esperava event:rsvp com going_count %v", last, want)
	}
}

func TestRSVPOnEndedOrCanceledEvent(t *testing.T) {
	e := newEnv()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", goodInput())
	done := testNow
	e.store.events[created.ID].FinishedAt = &done
	if err := e.svc.SetRSVP(context.Background(), "s1", created.ID, "membro", true); !errors.Is(err, ErrEventEnded) {
		t.Errorf("encerrado = %v", err)
	}
	e.store.events[created.ID].FinishedAt = nil
	e.store.events[created.ID].CanceledAt = &done
	if err := e.svc.SetRSVP(context.Background(), "s1", created.ID, "membro", true); !errors.Is(err, ErrEventNotFound) {
		t.Errorf("cancelado = %v", err)
	}
}

func TestListNeedsMembership(t *testing.T) {
	e := newEnv()
	_, _ = e.svc.Create(context.Background(), "s1", "mod", goodInput())
	if _, err := e.svc.List(context.Background(), "s1", "estranho"); !errors.Is(err, ErrNotMember) {
		t.Fatalf("não membro = %v", err)
	}
	list, err := e.svc.List(context.Background(), "s1", "membro")
	if err != nil || len(list) != 1 {
		t.Fatalf("lista = %+v err=%v", list, err)
	}
}

// fakeRooms registra o que o service pede às salas.
type fakeRooms struct {
	closed  []RoomRef
	allowed []string // "evento|pessoa|true/false"
}

func (f *fakeRooms) Close(_ context.Context, ref RoomRef) error {
	f.closed = append(f.closed, ref)
	return nil
}

func (f *fakeRooms) Allow(_ context.Context, e *Event, userID string, allowed bool) {
	f.allowed = append(f.allowed, e.ID+"|"+userID+"|"+map[bool]string{true: "true", false: "false"}[allowed])
}

func envWithRooms() (env, *fakeRooms) {
	e := newEnv()
	rooms := &fakeRooms{}
	e.svc.WithRooms(rooms)
	return e, rooms
}

func TestCreateStoresTheDuration(t *testing.T) {
	e := newEnv()
	in := goodInput()
	got, err := e.svc.Create(context.Background(), "s1", "mod", in)
	if err != nil || got.DurationMinutes != DefaultDuration {
		t.Fatalf("sem duração: %+v err=%v", got, err)
	}
	in.DurationMinutes = 60
	got, err = e.svc.Create(context.Background(), "s1", "mod", in)
	if err != nil || got.DurationMinutes != 60 {
		t.Fatalf("1 h: %+v err=%v", got, err)
	}
}

func TestCancelClosesTheOpenRoom(t *testing.T) {
	e, rooms := envWithRooms()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", goodInput())
	voice, text := "voz-1", "txt-1"
	e.store.events[created.ID].VoiceChannelID = &voice
	e.store.events[created.ID].TextChannelID = &text

	if err := e.svc.Cancel(context.Background(), "s1", created.ID, "mod"); err != nil {
		t.Fatal(err)
	}
	if len(rooms.closed) != 1 || rooms.closed[0].EventID != created.ID || *rooms.closed[0].VoiceID != "voz-1" || *rooms.closed[0].TextID != "txt-1" {
		t.Fatalf("salas fechadas = %+v", rooms.closed)
	}
}

func TestCancelWithoutARoomDoesNotCloseAnything(t *testing.T) {
	e, rooms := envWithRooms()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", goodInput())
	if err := e.svc.Cancel(context.Background(), "s1", created.ID, "mod"); err != nil {
		t.Fatal(err)
	}
	if len(rooms.closed) != 0 {
		t.Fatalf("não havia sala: %+v", rooms.closed)
	}
}

func TestRSVPGivesAndTakesAccessToTheRoom(t *testing.T) {
	e, rooms := envWithRooms()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", goodInput())
	steps := []struct {
		do   func() error
		want string
	}{
		{func() error { return e.svc.SetRSVP(context.Background(), "s1", created.ID, "membro", true) }, created.ID + "|membro|true"},
		{func() error { return e.svc.SetRSVP(context.Background(), "s1", created.ID, "membro", false) }, created.ID + "|membro|false"},
		{func() error { return e.svc.ClearRSVP(context.Background(), "s1", created.ID, "membro") }, created.ID + "|membro|false"},
	}
	for i, step := range steps {
		if err := step.do(); err != nil {
			t.Fatal(err)
		}
		if got := rooms.allowed[len(rooms.allowed)-1]; got != step.want || len(rooms.allowed) != i+1 {
			t.Fatalf("passo %d: %v, esperava terminar em %q", i, rooms.allowed, step.want)
		}
	}
}

type fakeBanners struct{ removed []string }

func (f *fakeBanners) Remove(id string) error {
	f.removed = append(f.removed, id)
	return nil
}

const (
	bannerOne = "11111111-1111-4111-8111-111111111111"
	bannerTwo = "22222222-2222-4222-8222-222222222222"
)

func envWithBanners() (env, *fakeBanners) {
	e := newEnv()
	banners := &fakeBanners{}
	e.svc.WithBanners(banners)
	return e, banners
}

func inputWithBanner(id *string) Input {
	in := goodInput()
	in.BannerID = id
	return in
}

func strPtr(s string) *string { return &s }

func TestUpdateReplacingTheBannerRemovesTheOldFile(t *testing.T) {
	e, banners := envWithBanners()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", inputWithBanner(strPtr(bannerOne)))
	if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", inputWithBanner(strPtr(bannerTwo))); err != nil {
		t.Fatal(err)
	}
	if len(banners.removed) != 1 || banners.removed[0] != bannerOne {
		t.Fatalf("arquivos apagados = %v, esperava só o banner antigo", banners.removed)
	}
}

func TestUpdateKeepingTheBannerKeepsTheFile(t *testing.T) {
	e, banners := envWithBanners()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", inputWithBanner(strPtr(bannerOne)))
	if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", inputWithBanner(strPtr(bannerOne))); err != nil {
		t.Fatal(err)
	}
	if len(banners.removed) != 0 {
		t.Fatalf("o banner continua o mesmo: %v", banners.removed)
	}
}

func TestUpdateRemovingTheBannerDeletesTheFile(t *testing.T) {
	e, banners := envWithBanners()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", inputWithBanner(strPtr(bannerOne)))
	if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", inputWithBanner(nil)); err != nil {
		t.Fatal(err)
	}
	if len(banners.removed) != 1 || banners.removed[0] != bannerOne {
		t.Fatalf("arquivos apagados = %v", banners.removed)
	}
}

func TestFailedUpdateKeepsTheOldBanner(t *testing.T) {
	e, banners := envWithBanners()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", inputWithBanner(strPtr(bannerOne)))
	e.store.failUpdate = true
	if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", inputWithBanner(strPtr(bannerTwo))); err == nil {
		t.Fatal("esperava erro")
	}
	if len(banners.removed) != 0 {
		t.Fatalf("se a edição falhou o banner antigo continua valendo: %v", banners.removed)
	}
}

func TestCancelRemovesTheBannerFile(t *testing.T) {
	e, banners := envWithBanners()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", inputWithBanner(strPtr(bannerOne)))
	if err := e.svc.Cancel(context.Background(), "s1", created.ID, "mod"); err != nil {
		t.Fatal(err)
	}
	if len(banners.removed) != 1 || banners.removed[0] != bannerOne {
		t.Fatalf("arquivos apagados = %v", banners.removed)
	}
}

// runningEvent cria um evento e o põe em andamento (começou há 10 min, na 3ª ocorrência).
func runningEvent(t *testing.T, banner *string) (env, *fakeBanners, *Event) {
	t.Helper()
	e, banners := envWithBanners()
	created, err := e.svc.Create(context.Background(), "s1", "mod", inputWithBanner(banner))
	if err != nil {
		t.Fatal(err)
	}
	stored := e.store.events[created.ID]
	stored.NextStartAt = testNow.Add(-10 * time.Minute)
	stored.OccurrencesDone = 2
	return e, banners, created
}

func TestRunningEventAllowsOnlySimpleEdits(t *testing.T) {
	e, _, created := runningEvent(t, nil)
	remindersBefore := len(e.store.reminders[created.ID])
	sentBefore := len(e.pub.sent)

	in := goodInput()
	in.Title, in.Description = "Novo título", "Nova descrição"
	got, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", in)
	if err != nil {
		t.Fatalf("editar o simples com o evento em andamento: %v", err)
	}
	if got.Title != "Novo título" || got.Description != "Nova descrição" {
		t.Fatalf("evento = %+v", got)
	}
	stored := e.store.events[created.ID]
	if stored.Title != "Novo título" || !stored.NextStartAt.Equal(testNow.Add(-10*time.Minute)) || stored.OccurrencesDone != 2 {
		t.Fatalf("só o simples muda; a ocorrência em andamento fica: %+v", stored)
	}
	if e.store.updateCalls != 0 || e.store.basicsCalls != 1 {
		t.Fatalf("edição completa=%d simples=%d: devia usar só a simples", e.store.updateCalls, e.store.basicsCalls)
	}
	if len(e.store.reminders[created.ID]) != remindersBefore {
		t.Fatal("os avisos não podem ser refeitos")
	}
	if last := e.pub.sent[len(e.pub.sent)-1]; len(e.pub.sent) != sentBefore+1 || last.event["type"] != "event:update" {
		t.Fatalf("o app precisa saber da mudança: %+v", last)
	}
}

func TestRunningEventRejectsScheduleChanges(t *testing.T) {
	cases := []struct {
		name string
		edit func(*Input)
	}{
		{"horário", func(i *Input) { i.StartsAt = i.StartsAt.Add(time.Hour) }},
		{"duração", func(i *Input) { i.DurationMinutes = 60 }},
		{"repetição", func(i *Input) { i.Recurrence = RecDaily }},
		{"fim por contagem", func(i *Input) { n := 3; i.Recurrence = RecWeekly; i.RecurrenceCount = &n }},
		{"antecedências", func(i *Input) { i.ReminderOffsets = []int{30} }},
	}
	for _, c := range cases {
		e, _, created := runningEvent(t, nil)
		in := goodInput()
		c.edit(&in)
		if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", in); !errors.Is(err, ErrEventRunning) {
			t.Errorf("%s: erro %v, esperava ErrEventRunning", c.name, err)
		}
		if e.store.basicsCalls != 0 || e.store.updateCalls != 0 {
			t.Errorf("%s: nada devia ser gravado", c.name)
		}
	}
}

func TestRunningEventStillValidatesTheSimpleFields(t *testing.T) {
	e, _, created := runningEvent(t, nil)
	in := goodInput()
	in.Title = "   "
	if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", in); !errors.Is(err, ErrInvalidTitle) {
		t.Fatalf("erro = %v, esperava ErrInvalidTitle", err)
	}
	in = goodInput()
	bad := "../../etc/passwd"
	in.BannerID = &bad
	if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", in); !errors.Is(err, ErrInvalidBanner) {
		t.Fatalf("erro = %v, esperava ErrInvalidBanner", err)
	}
}

func TestRunningEventSimpleEditReplacesTheBanner(t *testing.T) {
	e, banners, created := runningEvent(t, strPtr(bannerOne))
	if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", inputWithBanner(strPtr(bannerTwo))); err != nil {
		t.Fatal(err)
	}
	if len(banners.removed) != 1 || banners.removed[0] != bannerOne {
		t.Fatalf("arquivos apagados = %v", banners.removed)
	}
}

func TestRunningEventEditNeedsPermission(t *testing.T) {
	e, _, created := runningEvent(t, nil)
	if _, err := e.svc.Update(context.Background(), "s1", created.ID, "membro", goodInput()); !errors.Is(err, ErrMissingPermission) {
		t.Fatalf("erro = %v", err)
	}
}

func gameInput(name string) Input {
	in := goodInput()
	in.GameName = name
	return in
}

func TestCreateStoresTheGameOrNone(t *testing.T) {
	e := newEnv()
	with, err := e.svc.Create(context.Background(), "s1", "mod", gameInput("Minecraft"))
	if err != nil || with.GameName == nil || *with.GameName != "Minecraft" {
		t.Fatalf("com jogo: %+v err=%v", with, err)
	}
	without, err := e.svc.Create(context.Background(), "s1", "mod", gameInput(""))
	if err != nil || without.GameName != nil {
		t.Fatalf("sem jogo tem que ficar nil: %+v err=%v", without, err)
	}
}

func TestUpdateChangesAndClearsTheGame(t *testing.T) {
	e := newEnv()
	created, _ := e.svc.Create(context.Background(), "s1", "mod", gameInput("Minecraft"))
	changed, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", gameInput("VALORANT"))
	if err != nil || changed.GameName == nil || *changed.GameName != "VALORANT" {
		t.Fatalf("trocar: %+v err=%v", changed, err)
	}
	cleared, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", gameInput(""))
	if err != nil || cleared.GameName != nil {
		t.Fatalf("tirar: %+v err=%v", cleared, err)
	}
}

func TestInvalidGameIsRefused(t *testing.T) {
	e := newEnv()
	if _, err := e.svc.Create(context.Background(), "s1", "mod", gameInput(strings.Repeat("j", 65))); !errors.Is(err, ErrInvalidGame) {
		t.Fatalf("erro = %v, esperava ErrInvalidGame", err)
	}
}

// Com o evento em andamento o jogo fica travado, como o horário e a duração.
func TestRunningEventGameIsLocked(t *testing.T) {
	e := newEnv()
	created, err := e.svc.Create(context.Background(), "s1", "mod", gameInput("Minecraft"))
	if err != nil {
		t.Fatal(err)
	}
	e.store.events[created.ID].NextStartAt = testNow.Add(-10 * time.Minute)

	for _, name := range []string{"VALORANT", ""} {
		if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", gameInput(name)); !errors.Is(err, ErrEventRunning) {
			t.Errorf("trocar o jogo para %q com o evento em andamento: %v", name, err)
		}
	}
	in := gameInput("Minecraft")
	in.Title = "Novo título"
	if _, err := e.svc.Update(context.Background(), "s1", created.ID, "mod", in); err != nil {
		t.Fatalf("manter o jogo e mudar só o título: %v", err)
	}
	if got := e.store.events[created.ID]; got.Title != "Novo título" || got.GameName == nil || *got.GameName != "Minecraft" {
		t.Fatalf("evento = %+v", got)
	}
}
