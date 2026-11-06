package websocket

import (
	"context"
	"encoding/json"
	"strings"
	"reflect"
	"sort"
	"testing"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/server"
	"gin-quickstart/backend/internal/platform/wsevent"
)

// staticVisibility entrega o snapshot que o teste mexe a seguir.
type staticVisibility struct{ snap *permission.Snapshot }

func (v staticVisibility) Snapshot(context.Context, string) (*permission.Snapshot, error) {
	return v.snap, nil
}

func visibilitySnapshot() *permission.Snapshot {
	return permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).
		WithRole("vip", 1, 0).
		WithMember("dono").
		WithMember("vip", "vip").
		WithMember("ana").
		WithChannel("geral", permission.ChannelText).
		WithChannel("segredo", permission.ChannelText,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel},
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: permission.ViewChannel},
		)
}

// hubWithServerMembers: cada usuário assina a sala do servidor.
func hubWithServerMembers(snap *permission.Snapshot, users ...string) (*Hub, map[string]*Client) {
	h := NewHub()
	h.SetVisibility(staticVisibility{snap})
	clients := map[string]*Client{}
	for _, u := range users {
		c := newTestClient(h, u)
		h.Register(c)
		h.Subscribe(c, "server:s1")
		clients[u] = c
	}
	return h, clients
}

// events lê o tipo de cada evento que chegou ao cliente, ignorando presença.
func events(c *Client) []string {
	var types []string
	for len(c.send) > 0 {
		var ev struct {
			Type string `json:"type"`
		}
		_ = json.Unmarshal(<-c.send, &ev)
		if ev.Type != "presence:update" {
			types = append(types, ev.Type)
		}
	}
	return types
}

// Categoria privada: nem o canal com permissão própria entrega evento para quem não
// vê a categoria, e o aviso de categoria não diz nada além do id do servidor.
func TestPrivateCategoryKeepsEventsFromWhoCannotSee(t *testing.T) {
	closed := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel}
	vip := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: permission.ViewChannel}
	snap := visibilitySnapshot().
		WithCategory("privada", closed, vip).
		WithChannel("proprio", permission.ChannelText, permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Allow: permission.ViewChannel}).
		InCategory("proprio", "privada")
	h, clients := hubWithServerMembers(snap, "dono", "vip", "ana")
	for _, c := range clients {
		events(c)
	}

	h.BroadcastToServerChannel("s1", "proprio", wsevent.Marshal("message:create", map[string]string{"channel_id": "proprio", "content": "segredo"}))
	if got := events(clients["ana"]); len(got) != 0 {
		t.Fatalf("ana recebeu %v", got)
	}
	for _, user := range []string{"dono", "vip"} {
		if got := events(clients[user]); len(got) != 1 {
			t.Fatalf("%s recebeu %v", user, got)
		}
	}

	h.PublishCategoryChanged("s1")
	raw := <-clients["ana"].send
	if text := string(raw); strings.Contains(text, "privada") || strings.Contains(text, "proprio") {
		t.Fatalf("o aviso vazou: %s", text)
	}
}

// A ordem dos canais só diz a cada um os ids que ele vê.
func TestChannelReorderOnlyShowsVisibleChannels(t *testing.T) {
	snap := visibilitySnapshot().
		WithCategory("privada", permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel}).
		WithChannel("oculto", permission.ChannelText).
		InCategory("oculto", "privada")
	h, clients := hubWithServerMembers(snap, "dono", "ana")
	for _, c := range clients {
		events(c)
	}
	h.PublishChannelReorder(channel.ReorderEvent{ServerID: "s1", Type: "text", ChannelIDs: []string{"oculto", "segredo"}})
	ana := string(<-clients["ana"].send)
	if strings.Contains(ana, "oculto") || strings.Contains(ana, "segredo") {
		t.Fatalf("ana recebeu: %s", ana)
	}
	dono := string(<-clients["dono"].send)
	if !strings.Contains(dono, "oculto") || !strings.Contains(dono, "segredo") {
		t.Fatalf("o dono recebeu: %s", dono)
	}
}

func TestRevalidateRemovesWhoLostTheCategoryFromTheRoom(t *testing.T) {
	closed := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel}
	snap := visibilitySnapshot().
		WithCategory("privada", closed).
		WithChannel("c", permission.ChannelText).
		InCategory("c", "privada")
	h, clients := hubWithServerMembers(snap, "ana", "dono")
	h.Subscribe(clients["ana"], "channel:c")
	h.Subscribe(clients["dono"], "channel:c")
	h.RevalidateServer("s1")
	h.mu.RLock()
	defer h.mu.RUnlock()
	if _, ana := h.rooms["channel:c"][clients["ana"]]; ana {
		t.Fatal("ana continua na sala do canal")
	}
	if _, dono := h.rooms["channel:c"][clients["dono"]]; !dono {
		t.Fatal("o dono saiu da sala do canal")
	}
}

func TestMessageInPrivateChannelOnlyReachesViewers(t *testing.T) {
	h, clients := hubWithServerMembers(visibilitySnapshot(), "dono", "vip", "ana")
	for _, c := range clients {
		events(c)
	}

	secret, general := "segredo", "geral"
	h.PublishMessageCreate(message.CreateEvent{ServerID: "s1", ChannelID: &secret})
	h.PublishMessageCreate(message.CreateEvent{ServerID: "s1", ChannelID: &general})
	h.PublishMessageDelete(message.DeleteEvent{ServerID: "s1", ChannelID: &secret, MessageID: "m1"})

	want := map[string][]string{
		"dono": {"message:create", "message:create", "message:delete"},
		"vip":  {"message:create", "message:create", "message:delete"},
		"ana":  {"message:create"}, // só a do geral
	}
	for user, c := range clients {
		if got := events(c); !reflect.DeepEqual(got, want[user]) {
			t.Errorf("%s recebeu %v, want %v", user, got, want[user])
		}
	}
}

// message:update (edição) segue as salas do message:create: canal privado só
// para quem vê, DM para a sala de cada participante.
func TestMessageUpdateFollowsCreateRooms(t *testing.T) {
	h, clients := hubWithServerMembers(visibilitySnapshot(), "dono", "vip", "ana")
	for id, c := range clients {
		h.Subscribe(c, "user:"+id)
		events(c)
	}

	secret, general, dm := "segredo", "geral", "dm1"
	h.PublishMessageUpdate(message.UpdateEvent{ServerID: "s1", ChannelID: &secret})
	h.PublishMessageUpdate(message.UpdateEvent{ServerID: "s1", ChannelID: &general})
	h.PublishMessageUpdate(message.UpdateEvent{ConversationID: &dm, UserIDs: []string{"ana", "vip"}})

	want := map[string][]string{
		"dono": {"message:update", "message:update"},
		"vip":  {"message:update", "message:update", "message:update"},
		"ana":  {"message:update", "message:update"}, // geral e a DM
	}
	for user, c := range clients {
		if got := events(c); !reflect.DeepEqual(got, want[user]) {
			t.Errorf("%s recebeu %v, want %v", user, got, want[user])
		}
	}
}

func TestChannelEventsOnlyReachViewers(t *testing.T) {
	h, clients := hubWithServerMembers(visibilitySnapshot(), "dono", "vip", "ana")
	for _, c := range clients {
		events(c)
	}

	h.PublishChannelCreate(channel.CreateEvent{ServerID: "s1", Channel: channel.Channel{ID: "segredo"}})
	h.PublishChannelUpdate(channel.CreateEvent{ServerID: "s1", Channel: channel.Channel{ID: "segredo"}})
	h.PublishChannelCreate(channel.CreateEvent{ServerID: "s1", Channel: channel.Channel{ID: "geral"}})

	if got := events(clients["ana"]); !reflect.DeepEqual(got, []string{"channel:create"}) {
		t.Errorf("ana recebeu %v, só devia saber do geral", got)
	}
	if got := events(clients["vip"]); len(got) != 3 {
		t.Errorf("vip recebeu %v, devia receber os 3", got)
	}
}

func TestWithoutVisibilityNothingLeaks(t *testing.T) {
	h := NewHub() // sem SetVisibility: falha fechada
	c := newTestClient(h, "ana")
	h.Register(c)
	h.Subscribe(c, "server:s1")
	events(c)

	general := "geral"
	h.PublishMessageCreate(message.CreateEvent{ServerID: "s1", ChannelID: &general})
	if got := events(c); len(got) != 0 {
		t.Fatalf("sem provedor de permissões nada vai para a sala do servidor: %v", got)
	}
}

func roomsOf(c *Client) []string {
	rooms := []string{}
	for r := range c.rooms {
		rooms = append(rooms, r)
	}
	sort.Strings(rooms)
	return rooms
}

func TestRevalidateServerDropsClientsThatLostAccess(t *testing.T) {
	snap := visibilitySnapshot()
	h, clients := hubWithServerMembers(snap, "vip", "ana")
	h.Subscribe(clients["vip"], "channel:segredo")
	h.Subscribe(clients["vip"], "channel:geral")
	h.Subscribe(clients["ana"], "channel:geral")

	// Nada mudou: ninguém sai.
	h.RevalidateServer("s1")
	if got := roomsOf(clients["vip"]); !reflect.DeepEqual(got, []string{"channel:geral", "channel:segredo", "server:s1"}) {
		t.Fatalf("vip: %v", got)
	}

	// vip perde o cargo: sai do canal privado, continua no resto.
	snap.WithMember("vip")
	h.RevalidateServer("s1")
	if got := roomsOf(clients["vip"]); !reflect.DeepEqual(got, []string{"channel:geral", "server:s1"}) {
		t.Fatalf("vip depois de perder o cargo: %v", got)
	}
	if got := roomsOf(clients["ana"]); !reflect.DeepEqual(got, []string{"channel:geral", "server:s1"}) {
		t.Fatalf("ana não devia mudar: %v", got)
	}

	// Deixa de ser membro (expulso/banido): sai de tudo.
	delete(snap.MemberRoles, "ana")
	h.RevalidateServer("s1")
	if got := roomsOf(clients["ana"]); len(got) != 0 {
		t.Fatalf("ana expulsa devia sair de todas as salas: %v", got)
	}
	if _, in := h.rooms["server:s1"][clients["ana"]]; in {
		t.Fatal("o hub ainda lista a ana na sala do servidor")
	}
	if _, in := h.rooms["channel:geral"][clients["ana"]]; in {
		t.Fatal("o hub ainda lista a ana na sala do canal")
	}
}

func TestPermissionsChangedInvalidatesAndRevalidates(t *testing.T) {
	snap := visibilitySnapshot()
	h, clients := hubWithServerMembers(snap, "vip", "ana")
	h.Subscribe(clients["vip"], "channel:segredo")
	for _, c := range clients {
		events(c)
	}
	hooked := make(chan string, 1)
	h.SetPermissionsChangedHook(func(serverID string) { hooked <- serverID })

	snap.WithMember("vip") // perdeu o cargo
	h.PublishPermissionsChanged("s1")

	for user, c := range clients {
		if got := events(c); !reflect.DeepEqual(got, []string{"server:permissions:invalidate"}) {
			t.Errorf("%s recebeu %v", user, got)
		}
	}
	if _, in := clients["vip"].rooms["channel:segredo"]; in {
		t.Error("vip devia ter saído do canal privado")
	}
	if got := <-hooked; got != "s1" {
		t.Errorf("hook recebeu %q", got)
	}
}

func TestMemberRemovedNotifiesAndDropsRooms(t *testing.T) {
	snap := visibilitySnapshot()
	h, clients := hubWithServerMembers(snap, "vip", "ana")
	h.Subscribe(clients["ana"], "user:ana")
	h.Subscribe(clients["ana"], "channel:geral")
	for _, c := range clients {
		events(c)
	}

	delete(snap.MemberRoles, "ana") // o banco já tirou a ana
	h.PublishMemberRemoved(server.MemberRemovedEvent{ServerID: "s1", UserID: "ana", Reason: server.RemovedBan})

	if got := events(clients["vip"]); !reflect.DeepEqual(got, []string{"server:member:leave"}) {
		t.Errorf("vip recebeu %v", got)
	}
	got := events(clients["ana"])
	hasRemoved := false
	for _, typ := range got {
		if typ == "server:removed" {
			hasRemoved = true
		}
	}
	if !hasRemoved {
		t.Errorf("ana devia receber server:removed: %v", got)
	}
	if want := []string{"user:ana"}; !reflect.DeepEqual(roomsOf(clients["ana"]), want) {
		t.Errorf("ana só mantém a sala pessoal: %v", roomsOf(clients["ana"]))
	}
}

func TestValidatorRequiresViewForChannelRooms(t *testing.T) {
	snap := visibilitySnapshot()
	svc := permission.NewService(&permission.StaticStore{Snapshots: map[string]*permission.Snapshot{"s1": snap}})
	h := &Handler{perms: svc}
	ctx := context.Background()

	cases := []struct {
		user, channel string
		want          bool
	}{
		{"ana", "geral", true},
		{"ana", "segredo", false},
		{"vip", "segredo", true},
		{"dono", "segredo", true},
		{"zeca", "geral", false},
		{"ana", "nao-existe", false},
	}
	for _, tc := range cases {
		if got := h.validator(ctx, tc.user, tc.channel, "", "", "", ""); got != tc.want {
			t.Errorf("%s assinando channel:%s = %v, want %v", tc.user, tc.channel, got, tc.want)
		}
	}
}

// Apelido novo chega a todo o servidor, com o payload que o app lê.
func TestMemberNicknameReachesWholeServer(t *testing.T) {
	h, clients := hubWithServerMembers(visibilitySnapshot(), "dono", "vip", "ana")
	for _, c := range clients {
		events(c)
	}
	nick := "Aninha"
	h.PublishMemberNickname(server.NicknameEvent{ServerID: "s1", UserID: "ana", Nickname: &nick})

	for user, c := range clients {
		if len(c.send) != 1 {
			t.Fatalf("%s recebeu %d eventos", user, len(c.send))
		}
		var ev struct {
			Type    string               `json:"type"`
			Payload server.NicknameEvent `json:"payload"`
		}
		if err := json.Unmarshal(<-c.send, &ev); err != nil {
			t.Fatal(err)
		}
		if ev.Type != "server:member:nickname" || ev.Payload.UserID != "ana" || ev.Payload.Nickname == nil || *ev.Payload.Nickname != nick {
			t.Errorf("%s: evento = %+v", user, ev)
		}
	}
}
