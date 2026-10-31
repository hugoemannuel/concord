package event

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"
)

// fakeChannels guarda os canais em memória (channel.Service no teste).
type fakeChannels struct {
	created    []*channel.Channel
	overwrites map[string][]permission.Overwrite // por canal
	deleted    []string
	failNames  map[string]bool // nomes que o Create recusa (nome repetido)
	failType   string          // tipo de canal que o Create recusa
	nextID     int
}

func newFakeChannels() *fakeChannels {
	return &fakeChannels{overwrites: map[string][]permission.Overwrite{}, failNames: map[string]bool{}}
}

func (f *fakeChannels) Create(_ context.Context, ch *channel.Channel, overwrites ...permission.Overwrite) error {
	if f.failNames[ch.Name] || ch.Type == f.failType {
		return errors.New("nome repetido")
	}
	f.nextID++
	ch.ID = ch.Type + "-" + string(rune('0'+f.nextID))
	f.created = append(f.created, ch)
	f.overwrites[ch.ID] = append([]permission.Overwrite{}, overwrites...)
	return nil
}

func (f *fakeChannels) Delete(_ context.Context, id string) error {
	f.deleted = append(f.deleted, id)
	return nil
}

func (f *fakeChannels) FindByID(_ context.Context, id string) (*channel.Channel, error) {
	for _, ch := range f.created {
		if ch.ID == id {
			return ch, nil
		}
	}
	return nil, channel.ErrChannelNotFound
}

func (f *fakeChannels) SetOverwrite(_ context.Context, ch *channel.Channel, o permission.Overwrite) error {
	list := f.overwrites[ch.ID]
	for i := range list {
		if list[i].TargetType == o.TargetType && list[i].TargetID == o.TargetID {
			list[i] = o
			return nil
		}
	}
	f.overwrites[ch.ID] = append(list, o)
	return nil
}

func (f *fakeChannels) DeleteOverwrite(_ context.Context, ch *channel.Channel, targetType, targetID string) error {
	var kept []permission.Overwrite
	for _, o := range f.overwrites[ch.ID] {
		if o.TargetType != targetType || o.TargetID != targetID {
			kept = append(kept, o)
		}
	}
	f.overwrites[ch.ID] = kept
	return nil
}

func (f *fakeChannels) memberAllowed(channelID, userID string) bool {
	for _, o := range f.overwrites[channelID] {
		if o.TargetType == permission.TargetMember && o.TargetID == userID && o.Allow&permission.ViewChannel != 0 {
			return true
		}
	}
	return false
}

type fakeSnapshots struct{}

func (fakeSnapshots) Snapshot(_ context.Context, serverID string) (*permission.Snapshot, error) {
	return permission.NewSnapshot(serverID, "dono", permission.DefaultEveryone), nil
}

type fakeCalls struct{ closed []string }

func (f *fakeCalls) CloseChannelCall(_ context.Context, serverID, channelID string) {
	f.closed = append(f.closed, serverID+"|"+channelID)
}

type fakeRoomStore struct {
	voice, text string
	err         error
}

func (f *fakeRoomStore) SetRoom(_ context.Context, _, voiceID, textID string) error {
	f.voice, f.text = voiceID, textID
	return f.err
}

type roomEnv struct {
	rooms    *Rooms
	channels *fakeChannels
	calls    *fakeCalls
	store    *fakeRoomStore
}

func newRoomEnv() roomEnv {
	ch, calls, store := newFakeChannels(), &fakeCalls{}, &fakeRoomStore{}
	return roomEnv{rooms: NewRooms(ch, fakeSnapshots{}, calls, store), channels: ch, calls: calls, store: store}
}

func request() RoomRequest {
	owner := "org"
	return RoomRequest{
		EventID: "11111111-2222-4333-8444-555555555555", ServerID: "s1", Title: "Noite de jogos",
		Occurrence: time.Date(2026, 12, 4, 20, 0, 0, 0, time.UTC), CreatedBy: &owner,
	}
}

func TestOpenCreatesPrivateVoiceAndTextRoomsForTheConfirmed(t *testing.T) {
	e := newRoomEnv()
	if err := e.rooms.Open(context.Background(), request(), []string{"ana", "beto"}); err != nil {
		t.Fatal(err)
	}
	if len(e.channels.created) != 2 {
		t.Fatalf("canais criados = %d, esperava voz e texto", len(e.channels.created))
	}
	voice, text := e.channels.created[0], e.channels.created[1]
	if voice.Type != channel.TypeVoice || text.Type != channel.TypeText || voice.ServerID != "s1" {
		t.Fatalf("canais = %+v e %+v", voice, text)
	}
	if voice.Name != "evento-noite-de-jogos" || text.Name != "evento-noite-de-jogos-chat" {
		t.Errorf("nomes = %q e %q", voice.Name, text.Name)
	}
	for _, ch := range e.channels.created {
		list := e.channels.overwrites[ch.ID]
		if len(list) == 0 || list[0].TargetType != permission.TargetRole || list[0].Deny&permission.ViewChannel == 0 {
			t.Errorf("%s: o @everyone precisa ficar sem ver o canal: %+v", ch.Name, list)
		}
		for _, who := range []string{"ana", "beto", "org"} {
			if !e.channels.memberAllowed(ch.ID, who) {
				t.Errorf("%s: %s devia ver o canal", ch.Name, who)
			}
		}
		if e.channels.memberAllowed(ch.ID, "intruso") {
			t.Errorf("%s: quem não confirmou não pode ver", ch.Name)
		}
	}
	if !permissionAllows(e.channels.overwrites[voice.ID], "ana", permission.Connect) {
		t.Error("na voz, quem confirmou também precisa poder conectar")
	}
	if e.store.voice != voice.ID || e.store.text != text.ID {
		t.Errorf("ids gravados no evento = %q e %q", e.store.voice, e.store.text)
	}
}

func permissionAllows(list []permission.Overwrite, userID string, bit int64) bool {
	for _, o := range list {
		if o.TargetType == permission.TargetMember && o.TargetID == userID {
			return o.Allow&bit != 0
		}
	}
	return false
}

func TestOpenRetriesWithASuffixWhenTheNameIsTaken(t *testing.T) {
	e := newRoomEnv()
	e.channels.failNames["evento-noite-de-jogos"] = true
	if err := e.rooms.Open(context.Background(), request(), nil); err != nil {
		t.Fatal(err)
	}
	voice := e.channels.created[0]
	if !strings.HasPrefix(voice.Name, "evento-noite-de-jogos-") || voice.Name == "evento-noite-de-jogos" {
		t.Errorf("nome com sufixo esperado, veio %q", voice.Name)
	}
}

func TestOpenCleansUpWhenTheSecondChannelFails(t *testing.T) {
	e := newRoomEnv()
	e.channels.failType = channel.TypeText
	if err := e.rooms.Open(context.Background(), request(), nil); err == nil {
		t.Fatal("esperava erro")
	}
	if len(e.channels.deleted) != 1 || e.channels.deleted[0] != e.channels.created[0].ID {
		t.Errorf("a voz criada devia ser apagada, apagados = %v", e.channels.deleted)
	}
}

func TestOpenCleansUpWhenSavingTheRoomFails(t *testing.T) {
	e := newRoomEnv()
	e.store.err = errors.New("banco fora")
	if err := e.rooms.Open(context.Background(), request(), nil); err == nil {
		t.Fatal("esperava erro")
	}
	if len(e.channels.deleted) != 2 {
		t.Errorf("os dois canais criados devem ser apagados, apagados = %v", e.channels.deleted)
	}
}

func TestCloseKicksTheCallAndDeletesBothChannels(t *testing.T) {
	e := newRoomEnv()
	voice, text := "voz-1", "txt-1"
	err := e.rooms.Close(context.Background(), RoomRef{EventID: "e1", ServerID: "s1", VoiceID: &voice, TextID: &text})
	if err != nil {
		t.Fatal(err)
	}
	if len(e.calls.closed) != 1 || e.calls.closed[0] != "s1|voz-1" {
		t.Errorf("chamada fechada = %v", e.calls.closed)
	}
	if len(e.channels.deleted) != 2 {
		t.Errorf("apagados = %v", e.channels.deleted)
	}
}

func TestCloseWithOnlyOneChannelLeft(t *testing.T) {
	e := newRoomEnv()
	text := "txt-1"
	if err := e.rooms.Close(context.Background(), RoomRef{EventID: "e1", ServerID: "s1", TextID: &text}); err != nil {
		t.Fatal(err)
	}
	if len(e.calls.closed) != 0 || len(e.channels.deleted) != 1 {
		t.Errorf("chamadas=%v apagados=%v", e.calls.closed, e.channels.deleted)
	}
}

func openedEvent(t *testing.T, e roomEnv) *Event {
	t.Helper()
	if err := e.rooms.Open(context.Background(), request(), []string{"ana"}); err != nil {
		t.Fatal(err)
	}
	owner := "org"
	voice, text := e.channels.created[0].ID, e.channels.created[1].ID
	return &Event{ID: "e1", ServerID: "s1", CreatedBy: &owner, VoiceChannelID: &voice, TextChannelID: &text}
}

func TestAllowAddsAndRemovesAccessWhileTheRoomIsOpen(t *testing.T) {
	e := newRoomEnv()
	ev := openedEvent(t, e)
	voice, text := *ev.VoiceChannelID, *ev.TextChannelID

	e.rooms.Allow(context.Background(), ev, "carol", true)
	if !e.channels.memberAllowed(voice, "carol") || !e.channels.memberAllowed(text, "carol") {
		t.Fatal("quem confirmou depois precisa entrar nos dois canais")
	}
	e.rooms.Allow(context.Background(), ev, "carol", false)
	if e.channels.memberAllowed(voice, "carol") || e.channels.memberAllowed(text, "carol") {
		t.Fatal("quem desistiu perde o acesso aos dois canais")
	}
}

func TestAllowNeverTakesTheOrganizerOut(t *testing.T) {
	e := newRoomEnv()
	ev := openedEvent(t, e)
	e.rooms.Allow(context.Background(), ev, "org", false)
	if !e.channels.memberAllowed(*ev.VoiceChannelID, "org") {
		t.Fatal("o organizador continua com acesso mesmo dizendo Não vou")
	}
}

func TestAllowWithoutOpenRoomDoesNothing(t *testing.T) {
	e := newRoomEnv()
	e.rooms.Allow(context.Background(), &Event{ID: "e1", ServerID: "s1"}, "ana", true)
	if len(e.channels.overwrites) != 0 {
		t.Fatalf("nada devia ser gravado: %+v", e.channels.overwrites)
	}
}

func TestSlug(t *testing.T) {
	cases := map[string]string{
		"Noite de jogos":             "noite-de-jogos",
		"  Reunião: Ação & Coração!": "reuniao-acao-coracao",
		"!!!":                        "evento",
		"":                           "evento",
		strings.Repeat("a", 90):      strings.Repeat("a", 60),
	}
	for in, want := range cases {
		if got := slug(in); got != want {
			t.Errorf("slug(%q) = %q, esperava %q", in, got, want)
		}
	}
}
