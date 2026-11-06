package websocket

import (
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/message"
)

// Mensagem de canal chega uma vez só a quem está na sala do canal e na do
// servidor; quem só está no servidor recebe se vê o canal; quem não vê, nada.
func TestChannelMessageReachesEachConnectionOnce(t *testing.T) {
	h, clients := hubWithServerMembers(visibilitySnapshot(), "dono", "vip", "ana")
	h.Subscribe(clients["dono"], "channel:geral")
	h.Subscribe(clients["vip"], "channel:segredo")
	for _, c := range clients {
		events(c)
	}

	general, secret := "geral", "segredo"
	h.PublishMessageCreate(message.CreateEvent{ServerID: "s1", ChannelID: &general})
	h.PublishMessageCreate(message.CreateEvent{ServerID: "s1", ChannelID: &secret})

	want := map[string][]string{
		"dono": {"message:create", "message:create"}, // geral aberto + segredo pelo servidor
		"vip":  {"message:create", "message:create"}, // geral pelo servidor + segredo aberto
		"ana":  {"message:create"},                   // só o geral, pelo servidor
	}
	for user, c := range clients {
		if got := events(c); !reflect.DeepEqual(got, want[user]) {
			t.Errorf("%s recebeu %v, want %v", user, got, want[user])
		}
	}
}

// Sem provedor de permissões a sala do servidor não recebe, mas quem está com o
// canal aberto (já validado ao entrar na sala) continua recebendo.
func TestChannelRoomReceivesWithoutVisibility(t *testing.T) {
	h := NewHub()
	c := newTestClient(h, "ana")
	h.Register(c)
	h.Subscribe(c, "server:s1")
	h.Subscribe(c, "channel:geral")
	events(c)

	general := "geral"
	h.PublishMessageCreate(message.CreateEvent{ServerID: "s1", ChannelID: &general})
	if got := events(c); !reflect.DeepEqual(got, []string{"message:create"}) {
		t.Fatalf("recebeu %v, want uma message:create", got)
	}
}

// DM chega uma vez a quem está com a conversa aberta e na sala pessoal.
func TestConversationMessageReachesEachConnectionOnce(t *testing.T) {
	h := NewHub()
	ana, bia := newTestClient(h, "ana"), newTestClient(h, "bia")
	for _, c := range []*Client{ana, bia} {
		h.Register(c)
		h.Subscribe(c, "user:"+c.userID)
	}
	h.Subscribe(ana, "conversation:dm1")
	events(ana)
	events(bia)

	dm := "dm1"
	h.PublishMessageCreate(message.CreateEvent{ConversationID: &dm, UserIDs: []string{"ana", "bia"}})
	for _, c := range []*Client{ana, bia} {
		if got := events(c); !reflect.DeepEqual(got, []string{"message:create"}) {
			t.Errorf("%s recebeu %v, want uma message:create", c.userID, got)
		}
	}
}
