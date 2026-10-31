package event

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestReminderText(t *testing.T) {
	d := DueReminder{Title: "Noite de jogos", ChannelName: "evento-noite-de-jogos", ServerName: "Salinha"}
	cases := []struct {
		offset  int
		channel string
		want    string
	}{
		{10, "", `🔔 O evento "Noite de jogos" começa em 10 minutos, no servidor Salinha. A sala abre na hora de começar.`},
		{5, "", `🔔 O evento "Noite de jogos" começa em 5 minutos, no servidor Salinha. A sala abre na hora de começar.`},
		{60, "", `🔔 O evento "Noite de jogos" começa em 1 hora, no servidor Salinha. A sala abre na hora de começar.`},
		{1440, "", `🔔 O evento "Noite de jogos" começa em 1 dia, no servidor Salinha. A sala abre na hora de começar.`},
		{0, "evento-noite-de-jogos", `📅 O evento "Noite de jogos" está começando agora. Entre na sala #evento-noite-de-jogos, no servidor Salinha.`},
		{0, "", `📅 O evento "Noite de jogos" está começando agora, no servidor Salinha.`},
	}
	for _, c := range cases {
		d.OffsetMinutes, d.ChannelName = c.offset, c.channel
		if got := reminderText(d); got != c.want {
			t.Errorf("offset %d canal %q: %q, esperava %q", c.offset, c.channel, got, c.want)
		}
	}
}

func TestStale(t *testing.T) {
	occ := time.Date(2026, 11, 1, 20, 0, 0, 0, time.UTC)
	ante := DueReminder{OffsetMinutes: 10, Occurrence: occ, DueAt: occ.Add(-10 * time.Minute)}
	if stale(ante, ante.DueAt.Add(9*time.Minute)) {
		t.Error("aviso 9 min atrasado ainda vale")
	}
	if !stale(ante, ante.DueAt.Add(11*time.Minute)) {
		t.Error("aviso de antecedência 11 min atrasado é descartado")
	}
	start := DueReminder{OffsetMinutes: 0, Occurrence: occ, DueAt: occ}
	if stale(start, occ.Add(50*time.Minute)) {
		t.Error("o 'começou' ainda sai até 1 h depois")
	}
	if !stale(start, occ.Add(61*time.Minute)) {
		t.Error("o 'começou' some depois de 1 h")
	}
}

type fakeSchedStore struct {
	due      []DueReminder
	going    map[string][]string
	goingErr error
	toOpen   []RoomRequest
	toClose  []RoomRef
	advanced int
	log      *[]string
	// ticked: avisa o teste de cada AdvanceDue (sem bloquear o ticker).
	ticked chan struct{}
}

func (f *fakeSchedStore) note(step string) {
	if f.log != nil {
		*f.log = append(*f.log, step)
	}
}

func (f *fakeSchedStore) ClaimDue(context.Context, time.Time, int) ([]DueReminder, error) {
	f.note("claim")
	out := f.due
	f.due = nil // quem já foi reivindicado não volta (idempotência do UPDATE ... RETURNING)
	return out, nil
}

func (f *fakeSchedStore) Going(_ context.Context, eventID string, _ time.Time) ([]string, error) {
	return f.going[eventID], f.goingErr
}

func (f *fakeSchedStore) RoomsToOpen(context.Context, time.Time, int) ([]RoomRequest, error) {
	out := f.toOpen
	f.toOpen = nil
	return out, nil
}

func (f *fakeSchedStore) RoomsToClose(context.Context, time.Time, int) ([]RoomRef, error) {
	out := f.toClose
	f.toClose = nil
	return out, nil
}

func (f *fakeSchedStore) AdvanceDue(context.Context, time.Time, *time.Location, int) (int, error) {
	f.note("advance")
	f.advanced++
	select {
	case f.ticked <- struct{}{}:
	default:
	}
	return 0, nil
}

type fakeNotifier struct {
	sent   map[string][]string
	failOn string
}

func (n *fakeNotifier) Notify(_ context.Context, userID, text string) error {
	if userID == n.failOn {
		return errors.New("DM falhou")
	}
	if n.sent == nil {
		n.sent = map[string][]string{}
	}
	n.sent[userID] = append(n.sent[userID], text)
	return nil
}

func schedulerAt(store *fakeSchedStore, n *fakeNotifier, now time.Time) *Scheduler {
	s := NewScheduler(store, n, nil, nil)
	s.now = func() time.Time { return now }
	return s
}

// fakeSchedRooms registra as salas abertas e fechadas (e falha se mandarem).
type fakeSchedRooms struct {
	opened   []string // "evento|pessoas separadas por vírgula"
	closed   []string
	openErr  error
	closeErr error
	store    *fakeSchedStore
}

func (f *fakeSchedRooms) Open(_ context.Context, req RoomRequest, going []string) error {
	if f.store != nil {
		f.store.note("open")
	}
	if f.openErr != nil {
		return f.openErr
	}
	f.opened = append(f.opened, req.EventID+"|"+strings.Join(going, ","))
	return nil
}

func (f *fakeSchedRooms) Close(_ context.Context, ref RoomRef) error {
	if f.store != nil {
		f.store.note("close")
	}
	if f.closeErr != nil {
		return f.closeErr
	}
	f.closed = append(f.closed, ref.EventID)
	return nil
}

type fakeSchedPublisher struct{ rooms, events []string }

func (f *fakeSchedPublisher) BroadcastToRoom(room string, raw []byte) {
	f.rooms = append(f.rooms, room)
	f.events = append(f.events, string(raw))
}

var schedStart = time.Date(2026, 11, 1, 20, 0, 0, 0, time.UTC)

func dueAt(offset int) DueReminder {
	return DueReminder{
		ID: 1, EventID: "e1", Title: "Noite", ChannelName: "geral", ServerName: "Salinha",
		Occurrence: schedStart, DueAt: schedStart.Add(-time.Duration(offset) * time.Minute), OffsetMinutes: offset,
	}
}

func TestTickNotifiesOnlyWhoIsGoing(t *testing.T) {
	store := &fakeSchedStore{due: []DueReminder{dueAt(10)}, going: map[string][]string{"e1": {"ana", "beto"}}}
	n := &fakeNotifier{}
	schedulerAt(store, n, schedStart.Add(-10*time.Minute)).tick(context.Background())
	if len(n.sent) != 2 || len(n.sent["ana"]) != 1 || len(n.sent["beto"]) != 1 {
		t.Fatalf("enviados = %+v, esperava uma DM para ana e uma para beto", n.sent)
	}
	if n.sent["ana"][0] != reminderText(dueAt(10)) {
		t.Errorf("texto = %q", n.sent["ana"][0])
	}
}

func TestTickOneFailureDoesNotBlockTheOthers(t *testing.T) {
	store := &fakeSchedStore{due: []DueReminder{dueAt(5)}, going: map[string][]string{"e1": {"ana", "beto", "caio"}}}
	n := &fakeNotifier{failOn: "ana"}
	schedulerAt(store, n, schedStart.Add(-5*time.Minute)).tick(context.Background())
	if len(n.sent["beto"]) != 1 || len(n.sent["caio"]) != 1 || len(n.sent["ana"]) != 0 {
		t.Fatalf("enviados = %+v", n.sent)
	}
}

func TestTickDropsStaleReminders(t *testing.T) {
	store := &fakeSchedStore{due: []DueReminder{dueAt(10)}, going: map[string][]string{"e1": {"ana"}}}
	n := &fakeNotifier{}
	// O servidor voltou 30 min depois da hora do aviso de 10 min.
	schedulerAt(store, n, dueAt(10).DueAt.Add(30*time.Minute)).tick(context.Background())
	if len(n.sent) != 0 {
		t.Fatalf("aviso velho foi enviado: %+v", n.sent)
	}
}

func TestTickIsIdempotent(t *testing.T) {
	store := &fakeSchedStore{due: []DueReminder{dueAt(0)}, going: map[string][]string{"e1": {"ana"}}}
	n := &fakeNotifier{}
	s := schedulerAt(store, n, schedStart)
	s.tick(context.Background())
	s.tick(context.Background())
	if len(n.sent["ana"]) != 1 {
		t.Fatalf("a mesma DM saiu %d vezes", len(n.sent["ana"]))
	}
}

func TestTickAdvancesOccurrencesAfterSending(t *testing.T) {
	store := &fakeSchedStore{going: map[string][]string{}}
	schedulerAt(store, &fakeNotifier{}, schedStart).tick(context.Background())
	if store.advanced != 1 {
		t.Fatalf("AdvanceDue chamado %d vezes, esperava 1", store.advanced)
	}
}

func TestTickSurvivesGoingFailure(t *testing.T) {
	store := &fakeSchedStore{due: []DueReminder{dueAt(0)}, goingErr: errors.New("banco fora")}
	n := &fakeNotifier{}
	schedulerAt(store, n, schedStart).tick(context.Background())
	if len(n.sent) != 0 || store.advanced != 1 {
		t.Fatalf("enviados=%+v advanced=%d", n.sent, store.advanced)
	}
}

func TestRunTicksRepeatedlyUntilTheContextEnds(t *testing.T) {
	store := &fakeSchedStore{going: map[string][]string{}, ticked: make(chan struct{}, 100)}
	s := schedulerAt(store, &fakeNotifier{}, schedStart)
	s.every = 5 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		s.Run(ctx)
		close(done)
	}()
	for i := 0; i < 3; i++ { // a rodada de partida e mais duas do ticker
		select {
		case <-store.ticked:
		case <-time.After(2 * time.Second):
			t.Fatalf("o ticker parou na rodada %d", i)
		}
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run não terminou com o contexto cancelado")
	}
}

func roomEnvFor(store *fakeSchedStore) (*Scheduler, *fakeSchedRooms, *fakeSchedPublisher) {
	rooms := &fakeSchedRooms{store: store}
	pub := &fakeSchedPublisher{}
	s := NewScheduler(store, &fakeNotifier{}, rooms, pub)
	s.now = func() time.Time { return schedStart }
	return s, rooms, pub
}

func TestTickOpensTheRoomWithWhoIsGoingAndTellsTheApp(t *testing.T) {
	store := &fakeSchedStore{
		going:  map[string][]string{"e1": {"ana", "beto"}},
		toOpen: []RoomRequest{{EventID: "e1", ServerID: "s1", Title: "Noite", Occurrence: schedStart}},
	}
	s, rooms, pub := roomEnvFor(store)
	s.tick(context.Background())
	if len(rooms.opened) != 1 || rooms.opened[0] != "e1|ana,beto" {
		t.Fatalf("salas abertas = %v", rooms.opened)
	}
	if len(pub.rooms) != 1 || pub.rooms[0] != "server:s1" || !strings.Contains(pub.events[0], `"event:update"`) {
		t.Fatalf("aviso ao app = %v %v", pub.rooms, pub.events)
	}
}

func TestTickClosesEndedRoomsAndTellsTheApp(t *testing.T) {
	voice := "voz-1"
	store := &fakeSchedStore{toClose: []RoomRef{{EventID: "e1", ServerID: "s1", VoiceID: &voice}}}
	s, rooms, pub := roomEnvFor(store)
	s.tick(context.Background())
	if len(rooms.closed) != 1 || rooms.closed[0] != "e1" {
		t.Fatalf("salas fechadas = %v", rooms.closed)
	}
	if len(pub.events) != 1 || !strings.Contains(pub.events[0], `"event:update"`) {
		t.Fatalf("aviso ao app = %v", pub.events)
	}
}

func TestTickRunsTheStepsInOrder(t *testing.T) {
	var log []string
	voice := "voz-1"
	store := &fakeSchedStore{
		log:     &log,
		going:   map[string][]string{},
		toClose: []RoomRef{{EventID: "e0", ServerID: "s1", VoiceID: &voice}},
		toOpen:  []RoomRequest{{EventID: "e1", ServerID: "s1", Occurrence: schedStart}},
	}
	s, _, _ := roomEnvFor(store)
	s.tick(context.Background())
	if got := strings.Join(log, ","); got != "close,open,claim,advance" {
		t.Fatalf("ordem = %s, esperava fechar, abrir, avisar e só então avançar", got)
	}
}

func TestTickKeepsGoingWhenARoomFails(t *testing.T) {
	voice := "voz-1"
	store := &fakeSchedStore{
		going:   map[string][]string{"e1": {"ana"}},
		due:     []DueReminder{dueAt(0)},
		toOpen:  []RoomRequest{{EventID: "e1", ServerID: "s1", Occurrence: schedStart}},
		toClose: []RoomRef{{EventID: "e0", ServerID: "s1", VoiceID: &voice}},
	}
	s, rooms, pub := roomEnvFor(store)
	rooms.openErr, rooms.closeErr = errors.New("canal quebrou"), errors.New("canal quebrou")
	n := &fakeNotifier{}
	s.notifier = n
	s.tick(context.Background())
	if len(n.sent["ana"]) != 1 || store.advanced != 1 {
		t.Fatalf("avisos=%v avançou=%d: a falha da sala não pode parar o resto", n.sent, store.advanced)
	}
	if len(pub.events) != 0 {
		t.Errorf("sala que falhou não é anunciada: %v", pub.events)
	}
}

func TestTickWithoutRoomsOnlyHandlesReminders(t *testing.T) {
	store := &fakeSchedStore{
		going:  map[string][]string{},
		toOpen: []RoomRequest{{EventID: "e1", ServerID: "s1", Occurrence: schedStart}},
	}
	schedulerAt(store, &fakeNotifier{}, schedStart).tick(context.Background())
	if store.advanced != 1 {
		t.Fatalf("avançou %d vezes", store.advanced)
	}
}
