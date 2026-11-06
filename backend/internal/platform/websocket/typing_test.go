package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"sync"
	"testing"
	"time"

	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/user"
)

// fakeRoomAccess libera escrita para quem estiver em allowed[sala]. Com
// block, cada consulta espera o canal fechar (banco lento). Se started não
// for nil, avisa nele (sem bloquear) quando uma consulta começa.
type fakeRoomAccess struct {
	mu           sync.Mutex
	allowed      map[string]map[string]bool
	participants map[string][]string
	calls        int
	block        chan struct{}
	started      chan struct{}
}

func (f *fakeRoomAccess) WriteParticipants(_ context.Context, room message.Room, userID string) ([]string, error) {
	if f.started != nil {
		select {
		case f.started <- struct{}{}:
		default:
		}
	}
	if f.block != nil {
		<-f.block
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	key := "channel:" + room.ChannelID
	if room.ConversationID != "" {
		key = "conversation:" + room.ConversationID
	}
	if !f.allowed[key][userID] {
		return nil, message.ErrNoRoomAccess
	}
	return f.participants[room.ConversationID], nil
}

func (f *fakeRoomAccess) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

type typingEvent struct {
	Type    string `json:"type"`
	Payload struct {
		Room        string `json:"room"`
		UserID      string `json:"user_id"`
		DisplayName string `json:"display_name"`
	} `json:"payload"`
}

func typingEvents(t *testing.T, c *Client) []typingEvent {
	t.Helper()
	var events []typingEvent
	for {
		select {
		case raw := <-c.send:
			var ev typingEvent
			if err := json.Unmarshal(raw, &ev); err != nil {
				t.Fatal(err)
			}
			if ev.Type == "typing" || ev.Type == "typing:stop" {
				events = append(events, ev)
			}
		default:
			return events
		}
	}
}

// testClock: relógio que o teste adianta e os workers leem.
type testClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *testClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *testClock) Add(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

type typingFixture struct {
	hub         *Hub
	typing      *Typing
	access      *fakeRoomAccess
	clock       *testClock
	mu          sync.Mutex
	nameLookups int
}

func newTypingFixture() *typingFixture {
	return newTypingFixtureWith(nil, typingWorkers, typingQueueSize)
}

func newTypingFixtureWith(block chan struct{}, workers int, queueSize int) *typingFixture {
	f := &typingFixture{
		hub: NewHub(),
		access: &fakeRoomAccess{
			allowed: map[string]map[string]bool{
				"channel:c1":      {"ana": true, "bia": true, "caio": true},
				"conversation:d1": {"ana": true, "bia": true},
			},
			participants: map[string][]string{"d1": {"ana", "bia"}},
			block:        block,
		},
		clock: &testClock{t: time.Unix(1_700_000_000, 0)},
	}
	users := map[string]*user.User{
		"ana":  {ID: "ana", Username: "ana", DisplayName: "Ana"},
		"bia":  {ID: "bia", Username: "bia", DisplayName: "Bia"},
		"caio": {ID: "caio", Username: "caio"},
	}
	lookup := func(_ context.Context, id string) (*user.User, error) {
		f.mu.Lock()
		f.nameLookups++
		f.mu.Unlock()
		if u, ok := users[id]; ok {
			return u, nil
		}
		return &user.User{ID: id, Username: id}, nil
	}
	f.typing = newTyping(f.hub, f.access, lookup, workers, queueSize)
	f.typing.now = f.clock.Now
	return f
}

// join cria uma conexão de userID já dentro das salas.
func (f *typingFixture) join(userID string, rooms ...string) *Client {
	c := newTestClient(f.hub, userID)
	f.hub.Register(c)
	for _, room := range rooms {
		f.hub.Subscribe(c, room)
	}
	for len(c.send) > 0 {
		<-c.send
	}
	return c
}

// send manda o evento e espera a fila do digitando esvaziar.
func (f *typingFixture) send(userID, evType, room string) {
	f.post(userID, evType, room)
	f.typing.wait()
}

func (f *typingFixture) post(userID, evType, room string) {
	payload, _ := json.Marshal(map[string]string{"room": room})
	f.typing.Handle(context.Background(), userID, evType, payload)
}

func TestTypingReachesChannelViewersExceptSender(t *testing.T) {
	f := newTypingFixture()
	ana := f.join("ana", "channel:c1", "server:s1")
	anaOther := f.join("ana", "channel:c1") // outra aba/dispositivo da Ana
	bia := f.join("bia", "channel:c1", "server:s1")
	caioOtherChannel := f.join("caio", "server:s1")

	f.send("ana", "typing", "channel:c1")

	if got := typingEvents(t, ana); len(got) != 0 {
		t.Fatalf("quem digita não recebe o próprio evento: %+v", got)
	}
	if got := typingEvents(t, anaOther); len(got) != 0 {
		t.Fatalf("outra conexão de quem digita também não: %+v", got)
	}
	got := typingEvents(t, bia)
	if len(got) != 1 {
		t.Fatalf("bia recebeu %d eventos (sala do canal e do servidor não podem duplicar)", len(got))
	}
	p := got[0].Payload
	if got[0].Type != "typing" || p.Room != "channel:c1" || p.UserID != "ana" || p.DisplayName != "Ana" {
		t.Fatalf("evento = %+v", got[0])
	}
	if got := typingEvents(t, caioOtherChannel); len(got) != 0 {
		t.Fatalf("quem só está com o servidor aberto não recebe: %+v", got)
	}
}

func TestTypingInConversationReachesParticipantRooms(t *testing.T) {
	f := newTypingFixture()
	bia := f.join("bia", "conversation:d1", "user:bia")
	biaElsewhere := f.join("bia", "user:bia") // outra aba, com a DM fechada
	anaSelf := f.join("ana", "user:ana")

	f.send("ana", "typing", "conversation:d1")

	if got := typingEvents(t, bia); len(got) != 1 || got[0].Payload.Room != "conversation:d1" {
		t.Fatalf("bia na DM recebeu %+v", got)
	}
	if got := typingEvents(t, biaElsewhere); len(got) != 1 {
		t.Fatalf("a sala pessoal também recebe (lista de DMs): %+v", got)
	}
	if got := typingEvents(t, anaSelf); len(got) != 0 {
		t.Fatalf("a sala pessoal de quem digita não recebe: %+v", got)
	}
}

func TestTypingWithoutAccessIsDropped(t *testing.T) {
	f := newTypingFixture()
	bia := f.join("bia", "channel:c1", "conversation:d1", "user:bia")

	f.send("intruso", "typing", "channel:c1")
	f.send("caio", "typing", "conversation:d1")

	if got := typingEvents(t, bia); len(got) != 0 {
		t.Fatalf("sem acesso não pode avisar: %+v", got)
	}
}

func TestTypingIgnoresNonChatRooms(t *testing.T) {
	f := newTypingFixture()
	bia := f.join("bia", "server:s1", "user:bia", "call:x")

	for _, room := range []string{"server:s1", "user:bia", "call:x", "qualquer", ""} {
		f.send("ana", "typing", room)
	}

	if got := typingEvents(t, bia); len(got) != 0 {
		t.Fatalf("só canal e DM têm digitando: %+v", got)
	}
	if f.access.callCount() != 0 {
		t.Fatalf("sala inválida nem chega a consultar acesso (%d)", f.access.callCount())
	}
}

func TestTypingFallsBackToUsername(t *testing.T) {
	f := newTypingFixture()
	ana := f.join("ana", "channel:c1")

	f.send("caio", "typing", "channel:c1")

	got := typingEvents(t, ana)
	if len(got) != 1 || got[0].Payload.DisplayName != "caio" {
		t.Fatalf("sem nome de exibição vai o username: %+v", got)
	}
}

func TestTypingIsRateLimitedPerUser(t *testing.T) {
	f := newTypingFixture()
	bia := f.join("bia", "channel:c1", "conversation:d1")

	// Rajada curta passa (typing de novo logo depois de enviar); o resto da
	// rajada é descartado antes de chegar à fila.
	for i := 0; i < 5; i++ {
		f.send("ana", "typing", "channel:c1")
	}
	if got := typingEvents(t, bia); len(got) != typingBurst {
		t.Fatalf("rajada: recebeu %d, want %d", len(got), typingBurst)
	}

	f.send("caio", "typing", "channel:c1")
	if got := typingEvents(t, bia); len(got) != 1 {
		t.Fatalf("o limite é por pessoa: %+v", got)
	}

	// Depois da rajada, cerca de 1 por segundo (canal e DM contam juntos).
	f.clock.Add(1100 * time.Millisecond)
	f.send("ana", "typing", "conversation:d1")
	f.send("ana", "typing", "channel:c1")
	if got := typingEvents(t, bia); len(got) != 1 {
		t.Fatalf("1 por segundo depois da rajada: %+v", got)
	}
	f.clock.Add(500 * time.Millisecond)
	f.send("ana", "typing", "channel:c1")
	if got := typingEvents(t, bia); len(got) != 0 {
		t.Fatalf("meio segundo depois ainda não: %+v", got)
	}
	f.clock.Add(500 * time.Millisecond)
	f.send("ana", "typing", "channel:c1")
	if got := typingEvents(t, bia); len(got) != 1 {
		t.Fatalf("passado o segundo volta a valer: %+v", got)
	}
}

func TestTypingStopHasItsOwnAllowance(t *testing.T) {
	f := newTypingFixture()
	bia := f.join("bia", "channel:c1")

	// typing → stop → typing → stop em menos de 1 s: o último stop não pode
	// cair (o aviso ficaria 5 s a mais na tela de quem vê).
	for _, ev := range []string{"typing", "typing:stop", "typing", "typing:stop", "typing", "typing:stop"} {
		f.send("ana", ev, "channel:c1")
		f.clock.Add(50 * time.Millisecond)
	}
	got := typingEvents(t, bia)
	if len(got) != 6 || got[5].Type != "typing:stop" {
		t.Fatalf("eventos = %+v", got)
	}

	for i := 0; i < 3; i++ {
		f.send("ana", "typing:stop", "channel:c1")
	}
	if got := typingEvents(t, bia); len(got) != 0 {
		t.Fatalf("stop também tem limite: %+v", got)
	}
}

func TestTypingCachesAccessAndName(t *testing.T) {
	f := newTypingFixture()
	bia := f.join("bia", "channel:c1", "conversation:d1")

	f.send("ana", "typing", "channel:c1")
	f.clock.Add(3 * time.Second)
	f.send("ana", "typing", "channel:c1")
	f.send("ana", "typing:stop", "channel:c1")
	f.clock.Add(3 * time.Second)
	f.send("ana", "typing", "channel:c1")
	if got := typingEvents(t, bia); len(got) != 4 {
		t.Fatalf("recebeu %d eventos", len(got))
	}
	if calls := f.access.callCount(); calls != 1 {
		t.Fatalf("acesso consultado %d vezes, want 1 (cache por pessoa e sala)", calls)
	}
	if f.nameLookups != 1 {
		t.Fatalf("nome consultado %d vezes, want 1", f.nameLookups)
	}

	// Outra sala é outra decisão; na DM uma consulta só traz os participantes.
	f.send("ana", "typing", "conversation:d1")
	if calls := f.access.callCount(); calls != 2 {
		t.Fatalf("DM: %d consultas de acesso, want 2", calls)
	}

	// Vencido o prazo, confere de novo.
	f.clock.Add(typingAllowTTL)
	f.send("ana", "typing", "channel:c1")
	if calls := f.access.callCount(); calls != 3 {
		t.Fatalf("depois do prazo: %d consultas, want 3", calls)
	}
	if f.nameLookups != 2 {
		t.Fatalf("nome depois do prazo: %d consultas, want 2", f.nameLookups)
	}
}

func TestTypingCachesDenialBriefly(t *testing.T) {
	f := newTypingFixture()
	bia := f.join("bia", "channel:c1")

	f.send("intruso", "typing", "channel:c1")
	f.clock.Add(2 * time.Second)
	f.send("intruso", "typing", "channel:c1")
	if calls := f.access.callCount(); calls != 1 {
		t.Fatalf("negado também fica guardado: %d consultas", calls)
	}

	// Ganhou acesso (entrou no servidor): vale depois do prazo curto.
	f.access.mu.Lock()
	f.access.allowed["channel:c1"]["intruso"] = true
	f.access.mu.Unlock()
	f.clock.Add(typingDenyTTL)
	f.send("intruso", "typing", "channel:c1")
	if got := typingEvents(t, bia); len(got) != 1 {
		t.Fatalf("depois do prazo do negado: %+v", got)
	}
}

func TestTypingDoesNotBlockTheReadLoop(t *testing.T) {
	block := make(chan struct{})
	f := newTypingFixtureWith(block, 1, 2)
	f.access.started = make(chan struct{}, 1)
	bia := f.join("bia", "channel:c1")

	// post manda os eventos de from até to-1 e falha se o Handle travar.
	post := func(from, to int) {
		t.Helper()
		done := make(chan struct{})
		go func() {
			for i := from; i < to; i++ {
				f.post(fmt.Sprintf("u%d", i), "typing", "channel:c1")
			}
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatal("Handle travou esperando o banco")
		}
	}

	// O primeiro só conta como "em andamento" depois que o worker o tirou da
	// fila e está preso no banco; antes disso ele ainda ocupa a fila.
	post(0, 1)
	select {
	case <-f.access.started:
	case <-time.After(2 * time.Second):
		t.Fatal("o worker não pegou o primeiro evento")
	}

	// 1 no worker + 2 na fila; o resto descarta sem esperar o banco.
	post(1, 10)

	f.access.mu.Lock()
	for i := 0; i < 10; i++ {
		f.access.allowed["channel:c1"][fmt.Sprintf("u%d", i)] = true
	}
	f.access.mu.Unlock()
	close(block)
	f.typing.wait()
	if got := typingEvents(t, bia); len(got) != 3 {
		t.Fatalf("com a fila cheia passam %d, want 3 (1 em andamento + 2 na fila)", len(got))
	}
}

func TestTypingKeepsOrderPerUser(t *testing.T) {
	f := newTypingFixture()
	bia := f.join("bia", "channel:c1")

	for round := 0; round < 20; round++ {
		f.post("ana", "typing", "channel:c1")
		f.post("ana", "typing:stop", "channel:c1")
		f.typing.wait()
		got := typingEvents(t, bia)
		if len(got) != 2 || got[0].Type != "typing" || got[1].Type != "typing:stop" {
			t.Fatalf("rodada %d: ordem trocada: %+v", round, got)
		}
		f.clock.Add(2 * time.Second)
	}
}

func TestTypingLimiterSweepsFullBuckets(t *testing.T) {
	f := newTypingFixture()
	for i := 0; i < typingLimiterSweepAt; i++ {
		f.typing.allow(fmt.Sprintf("u%d|typing", i))
	}
	// Ainda dentro da janela: ninguém está com a folga cheia.
	f.typing.allow("x|typing")
	if n := len(f.typing.buckets); n != typingLimiterSweepAt+1 {
		t.Fatalf("buckets = %d", n)
	}

	f.clock.Add(typingBurst * typingRefill)
	f.typing.allow("y|typing")
	if n := len(f.typing.buckets); n != 1 {
		t.Fatalf("depois de encherem, a varredura apaga: sobraram %d", n)
	}
}

func TestTypingStop(t *testing.T) {
	f := newTypingFixture()
	bia := f.join("bia", "channel:c1")
	ana := f.join("ana", "channel:c1")

	// Digita, apaga tudo e volta a digitar logo em seguida.
	f.send("ana", "typing", "channel:c1")
	f.clock.Add(100 * time.Millisecond)
	f.send("ana", "typing:stop", "channel:c1")
	f.clock.Add(100 * time.Millisecond)
	f.send("ana", "typing", "channel:c1")

	got := typingEvents(t, bia)
	if len(got) != 3 {
		t.Fatalf("typing/stop/typing em sequência chegam todos: %+v", got)
	}
	stop := got[1]
	if stop.Type != "typing:stop" || stop.Payload.Room != "channel:c1" || stop.Payload.UserID != "ana" {
		t.Fatalf("stop = %+v", stop)
	}
	if got := typingEvents(t, ana); len(got) != 0 {
		t.Fatalf("quem parou não recebe o stop: %+v", got)
	}
}

func TestTypingRooms(t *testing.T) {
	cases := []struct {
		name string
		got  []string
		want []string
	}{
		{"canal", typingRooms(typingJob{channelID: "c1"}, nil), []string{"channel:c1"}},
		{"dm", typingRooms(typingJob{conversationID: "d1"}, []string{"ana", "", "bia"}), []string{"conversation:d1", "user:ana", "user:bia"}},
	}
	for _, tc := range cases {
		if !reflect.DeepEqual(tc.got, tc.want) {
			t.Errorf("%s: %v, want %v", tc.name, tc.got, tc.want)
		}
	}
}
