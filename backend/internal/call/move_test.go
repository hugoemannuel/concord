package call

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/platform/websocket"
)

func voiceChannel(id string) *channel.Channel {
	return &channel.Channel{ID: id, ServerID: "server-1", Type: channel.TypeVoice}
}

var inGeral = voiceLocation{callID: "call-1", channelID: "geral", serverID: "server-1"}

func TestModeratorMovesMember(t *testing.T) {
	if err := checkMove(true, inGeral, true, voiceChannel("jogos")); err != nil {
		t.Fatalf("moderator moving member: %v", err)
	}
}

func TestOnlyModeratorsMove(t *testing.T) {
	err := checkMove(false, inGeral, true, voiceChannel("jogos"))
	if !errors.Is(err, ErrNotModerator) {
		t.Fatalf("member moving = %v, want ErrNotModerator", err)
	}
}

func TestModeratorMovesOwner(t *testing.T) {
	if err := checkMove(true, inGeral, true, voiceChannel("jogos")); err != nil {
		t.Fatalf("moderator moving owner = %v, want nil", err)
	}
}

func TestMoveDestinationRules(t *testing.T) {
	text := &channel.Channel{ID: "chat", ServerID: "server-1", Type: channel.TypeText}
	if err := checkMove(true, inGeral, true, text); !errors.Is(err, ErrNotVoiceChannel) {
		t.Fatalf("text channel = %v, want ErrNotVoiceChannel", err)
	}

	other := &channel.Channel{ID: "x", ServerID: "server-2", Type: channel.TypeVoice}
	if err := checkMove(true, inGeral, true, other); !errors.Is(err, ErrNotInVoice) {
		t.Fatalf("other server = %v, want ErrNotInVoice", err)
	}

	if err := checkMove(true, voiceLocation{}, false, voiceChannel("jogos")); !errors.Is(err, ErrNotInVoice) {
		t.Fatalf("not in voice = %v, want ErrNotInVoice", err)
	}

	if err := checkMove(true, inGeral, true, voiceChannel("geral")); !errors.Is(err, ErrSameChannel) {
		t.Fatalf("same channel = %v, want ErrSameChannel", err)
	}
}

func TestVoiceLocationOf(t *testing.T) {
	s := serviceWithCall("call-1", "ana")
	channelID, serverID := "geral", "server-1"
	s.calls["call-1"].info.ChannelID = &channelID
	s.calls["call-1"].info.ServerID = &serverID
	s.busy["ana"] = "call-1"

	loc, ok := s.voiceLocationOf("ana")
	if !ok || loc != inGeral {
		t.Fatalf("voiceLocationOf(ana) = %+v, %v", loc, ok)
	}
	if _, ok := s.voiceLocationOf("bia"); ok {
		t.Fatal("bia is not in any call")
	}

	s.calls["call-1"].info.Type = TypeDM
	if _, ok := s.voiceLocationOf("ana"); ok {
		t.Fatal("a DM call is not a voice channel")
	}
}

// O publisher de verdade (o Hub) sabe tirar alguém da sala da chamada.
var _ callRoomLeaver = (*websocket.Hub)(nil)

// roomPublisher imita as salas do Hub: BroadcastToCall chega só a quem está
// inscrito em call:<id>, SendToUser chega sempre.
type roomPublisher struct {
	members map[string]map[string]bool // sala -> usuários inscritos
	got     map[string][]string        // usuário -> tipos de evento recebidos
}

func newRoomPublisher() *roomPublisher {
	return &roomPublisher{members: map[string]map[string]bool{}, got: map[string][]string{}}
}

func (p *roomPublisher) join(room string, users ...string) {
	if p.members[room] == nil {
		p.members[room] = map[string]bool{}
	}
	for _, u := range users {
		p.members[room][u] = true
	}
}

func (p *roomPublisher) deliver(userID string, raw []byte) {
	var event struct {
		Type string `json:"type"`
	}
	_ = json.Unmarshal(raw, &event)
	p.got[userID] = append(p.got[userID], event.Type)
}

func (p *roomPublisher) SendToUser(userID string, event []byte) { p.deliver(userID, event) }
func (p *roomPublisher) BroadcastToCall(callID string, event []byte) {
	p.BroadcastToRoom("call:"+callID, event)
}
func (p *roomPublisher) BroadcastToRoom(room string, event []byte) {
	for u := range p.members[room] {
		p.deliver(u, event)
	}
}
func (p *roomPublisher) UnsubscribeUser(userID, room string) { delete(p.members[room], userID) }

func (p *roomPublisher) received(userID, eventType string) bool {
	for _, t := range p.got[userID] {
		if t == eventType {
			return true
		}
	}
	return false
}

// moveFixture: ana (e quem mais vier) na chamada call-1 do canal geral; o
// mod a move para o palco. Sem banco: sair avisa a chamada como o Leave
// (call:left e, se esvaziou, call:ended) e entrar no destino dá a call-2.
func moveFixture(t *testing.T, inGeral ...string) (*Service, *roomPublisher) {
	t.Helper()
	svc, _, _ := newVoiceService(voiceSnapshot())
	pub := newRoomPublisher()
	svc.publisher = pub
	putInCall(svc, "call-1", "geral", inGeral...)
	pub.join("call:call-1", inGeral...)
	pub.join("server:srv-1", "dono", "mod", "ana")
	svc.leaveCall = func(_ context.Context, callID, userID string) error {
		remaining, _, err := svc.detachParticipant(callID, userID)
		svc.publisher.BroadcastToCall(callID, marshalEvent("call:left", StateEvent{CallID: callID, User: UserInfo{ID: userID}}))
		if remaining == 0 {
			svc.publisher.BroadcastToCall(callID, marshalEvent("call:ended", EndedEvent{CallID: callID}))
		}
		return err
	}
	return svc, pub
}

func moveAnaToPalco(t *testing.T, svc *Service) *Call {
	t.Helper()
	joined := &Call{ID: "call-2"}
	palco := &channel.Channel{ID: "palco", ServerID: "srv-1", Type: channel.TypeVoice}
	call, err := svc.moveTo(context.Background(), "mod", "ana", palco, func() (*Call, error) {
		return joined, nil
	})
	if err != nil {
		t.Fatalf("moveTo: %v", err)
	}
	if call != joined {
		t.Fatalf("moveTo devolveu %+v, quer a chamada do destino", call)
	}
	return call
}

// Issue #368: quem estava sozinha recebia o call:ended da chamada antiga antes
// do call:moved; o cliente largava a chamada e ignorava o call:moved, e a
// pessoa ficava na lista do canal novo sem estar de fato nele.
func TestMovedAloneDoesNotHearOldCallEnd(t *testing.T) {
	svc, pub := moveFixture(t, "ana")

	moveAnaToPalco(t, svc)

	if pub.received("ana", "call:ended") || pub.received("ana", "call:left") {
		t.Fatalf("ana recebeu o fim da chamada antiga: %v", pub.got["ana"])
	}
	if !pub.received("ana", "call:moved") {
		t.Fatalf("ana não recebeu o call:moved: %v", pub.got["ana"])
	}
}

// Com gente ficando na sala antiga, quem fica a vê sair; ela mesma só recebe
// o call:moved (o call:left dela fazia o cliente tentar voltar para a sala antiga).
func TestMovedLeavesOthersBehind(t *testing.T) {
	svc, pub := moveFixture(t, "ana", "mod")

	moveAnaToPalco(t, svc)

	if !pub.received("mod", "call:left") {
		t.Fatalf("mod não viu a ana sair: %v", pub.got["mod"])
	}
	if pub.received("ana", "call:left") {
		t.Fatalf("ana recebeu a própria saída da chamada antiga: %v", pub.got["ana"])
	}
	if !pub.received("ana", "call:moved") {
		t.Fatalf("ana não recebeu o call:moved: %v", pub.got["ana"])
	}
}
