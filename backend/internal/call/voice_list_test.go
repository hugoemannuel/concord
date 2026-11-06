package call

import (
	"context"
	"encoding/json"
	"testing"
)

// channelPublisher grava, além do resto, o que vai só para quem vê o canal.
type channelPublisher struct {
	fakePublisher
}

func (c *channelPublisher) BroadcastToServerChannel(serverID, channelID string, event []byte) {
	c.record("server:"+serverID+"#"+channelID, event)
}

// voiceListRig: chamada de canal "call-1" (server-1, canal "voz") com ana dentro.
func voiceListRig() (*Service, *channelPublisher) {
	pub := &channelPublisher{}
	s := channelCallWith(pub, "ana")
	channelID := "voz"
	s.calls["call-1"].info.ChannelID = &channelID
	stubLookupUser(s)
	return s, pub
}

// typesTo devolve os tipos de evento enviados para `target`, em ordem.
func typesTo(pub *channelPublisher, target string) []string {
	var out []string
	for _, e := range pub.sent {
		if e.target != target {
			continue
		}
		var typ string
		_ = json.Unmarshal(e.event["type"], &typ)
		out = append(out, typ)
	}
	return out
}

func payloadOf(t *testing.T, pub *channelPublisher, target, typ string, into any) {
	t.Helper()
	for _, e := range pub.sent {
		var got string
		_ = json.Unmarshal(e.event["type"], &got)
		if e.target == target && got == typ {
			if err := json.Unmarshal(e.event["payload"], into); err != nil {
				t.Fatalf("payload de %s: %v", typ, err)
			}
			return
		}
	}
	t.Fatalf("%s não foi para %s: %+v", typ, target, pub.sent)
}

const voiceRoom = "server:server-1#voz"

func TestJoinAnnouncesToWhoSeesTheChannel(t *testing.T) {
	s, pub := voiceListRig()

	if _, err := s.joinLocked(context.Background(), s.calls["call-1"], "bia", RoleMember); err != nil {
		t.Fatalf("joinLocked: %v", err)
	}

	var p struct {
		Call        Call            `json:"call"`
		Participant ParticipantInfo `json:"participant"`
	}
	payloadOf(t, pub, voiceRoom, "call:channel_joined", &p)
	if p.Call.ID != "call-1" || p.Call.ChannelID == nil || *p.Call.ChannelID != "voz" {
		t.Fatalf("call = %+v", p.Call)
	}
	if p.Participant.UserID != "bia" || p.Participant.ID != "bia" || p.Participant.CallID != "call-1" {
		t.Fatalf("participant = %+v", p.Participant)
	}
	// Quem está na chamada segue recebendo o call:joined de sempre.
	if got := typesTo(pub, "call:call-1"); len(got) != 1 || got[0] != "call:joined" {
		t.Fatalf("sala da chamada = %v", got)
	}
	// Nada vai para o servidor inteiro: canal privado não vaza quem está nele.
	if got := typesTo(pub, "server:server-1"); len(got) != 0 {
		t.Fatalf("servidor inteiro recebeu %v", got)
	}
}

func TestLeaveAnnouncesToWhoSeesTheChannel(t *testing.T) {
	s, pub := voiceListRig()
	s.calls["call-1"].participants["bia"] = &participantState{userID: "bia", role: RoleMember}

	if _, removed, err := s.detachParticipant("call-1", "bia"); err != nil || !removed {
		t.Fatalf("detachParticipant: removed=%v err=%v", removed, err)
	}

	var p ChannelLeftEvent
	payloadOf(t, pub, voiceRoom, "call:channel_left", &p)
	want := ChannelLeftEvent{CallID: "call-1", ServerID: "server-1", ChannelID: "voz", UserID: "bia"}
	if p != want {
		t.Fatalf("call:channel_left = %+v, want %+v", p, want)
	}
}

func TestEndAnnouncesToWhoSeesTheChannel(t *testing.T) {
	s, pub := voiceListRig()

	if err := s.End(context.Background(), "call-1"); err != nil {
		t.Fatalf("End: %v", err)
	}

	var p ChannelEndedEvent
	payloadOf(t, pub, voiceRoom, "call:channel_ended", &p)
	want := ChannelEndedEvent{CallID: "call-1", ServerID: "server-1", ChannelID: "voz"}
	if p != want {
		t.Fatalf("call:channel_ended = %+v, want %+v", p, want)
	}
	if got := typesTo(pub, "call:call-1"); len(got) != 1 || got[0] != "call:ended" {
		t.Fatalf("sala da chamada = %v", got)
	}
}

func TestDMDoesNotAnnounceToAnyServer(t *testing.T) {
	pub := &channelPublisher{}
	s := serviceWithCall("call-1", "ana", "bia")
	s.publisher = pub
	s.calls["call-1"].info.Type = TypeDM
	stubLookupUser(s)

	if _, _, err := s.detachParticipant("call-1", "bia"); err != nil {
		t.Fatalf("detachParticipant: %v", err)
	}
	if err := s.End(context.Background(), "call-1"); err != nil {
		t.Fatalf("End: %v", err)
	}
	for _, e := range pub.sent {
		if e.target != "call:call-1" {
			t.Fatalf("DM avisou %s", e.target)
		}
	}
}
