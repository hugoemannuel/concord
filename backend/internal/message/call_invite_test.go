package message

import (
	"context"
	"errors"
	"testing"
)

func TestNewCallInviteMessageIsPlainDMMessageFromInviter(t *testing.T) {
	server := "srv"
	m := newCallInviteMessage("dm1", "ana", CallInvite{CallID: "c1", ChannelID: "ch", ServerID: &server, ChannelName: "Geral", ServerName: "Salinha"})
	if m.AuthorID != "ana" || m.ConversationID == nil || *m.ConversationID != "dm1" || m.ChannelID != nil {
		t.Fatalf("msg = %+v", m)
	}
	// Não é mensagem do sistema: o autor é quem convidou.
	if m.SystemKind != nil || m.CallInvite == nil || m.CallInvite.CallID != "c1" || m.Content != CallInviteContent {
		t.Fatalf("msg = %+v", m)
	}
}

func TestCallInviteColumnRoundTrip(t *testing.T) {
	if callInviteBytes(nil) != nil || parseCallInvite(nil) != nil {
		t.Fatal("sem convite = coluna nula")
	}
	raw := callInviteBytes(&CallInvite{CallID: "c1", ChannelID: "ch", ChannelName: "Geral"})
	got := parseCallInvite(raw)
	if got == nil || got.CallID != "c1" || got.ChannelName != "Geral" {
		t.Fatalf("got = %+v", got)
	}
	// JSON antigo/quebrado não derruba a listagem: vira mensagem comum.
	if parseCallInvite([]byte("{")) != nil || parseCallInvite([]byte("{}")) != nil {
		t.Fatal("JSON ilegível ou sem call_id deve ser ignorado")
	}
}

func TestEditRejectsCallInviteMessages(t *testing.T) {
	invite := convMsg("inv", "ana", CallInviteContent)
	invite.CallInvite = &CallInvite{CallID: "c1", ChannelID: "ch"}
	s, _, _ := editEnv(invite)
	if _, err := s.EditConversationMessage(context.Background(), "dm1", "inv", "ana", "x"); !errors.Is(err, ErrNotEditable) {
		t.Fatalf("convite: err = %v", err)
	}
}

type fakeInviteStore struct {
	created *Message
	err     error
}

func (f *fakeInviteStore) Create(_ context.Context, m *Message) error {
	if f.err != nil {
		return f.err
	}
	f.created = m
	return nil
}

func (f *fakeInviteStore) FindByID(context.Context, string) (*Message, error) {
	copied := *f.created
	return &copied, nil
}

type captureCreates struct {
	fakePublisher
	events []CreateEvent
}

func (c *captureCreates) PublishMessageCreate(e CreateEvent) { c.events = append(c.events, e) }

func TestPostCallInvitePublishesToBothParticipants(t *testing.T) {
	store, pub := &fakeInviteStore{}, &captureCreates{}
	msg := newCallInviteMessage("dm1", "ana", CallInvite{CallID: "c1", ChannelID: "ch"})
	full, err := postToConversation(context.Background(), store, fakeRooms{}, pub, msg)
	if err != nil || full.CallInvite == nil {
		t.Fatalf("full=%+v err=%v", full, err)
	}
	if len(pub.events) != 1 || len(pub.events[0].UserIDs) != 2 || pub.events[0].Message.CallInvite.CallID != "c1" {
		t.Fatalf("events = %+v", pub.events)
	}
}

func TestPostCallInviteStoreFailure(t *testing.T) {
	store, pub := &fakeInviteStore{err: errors.New("db")}, &captureCreates{}
	msg := newCallInviteMessage("dm1", "ana", CallInvite{CallID: "c1", ChannelID: "ch"})
	if _, err := postToConversation(context.Background(), store, nil, pub, msg); err == nil || len(pub.events) != 0 {
		t.Fatalf("err=%v events=%d", err, len(pub.events))
	}
}

type fakeRow struct {
	invite []byte
	tts    bool
}

func (r fakeRow) Scan(dest ...any) error {
	// call_invite é a última coluna []byte (depois dela só vem embeds_suppressed).
	lastBytes := -1
	for i, d := range dest {
		if _, ok := d.(*[]byte); ok {
			lastBytes = i
		}
	}
	for i, d := range dest {
		switch p := d.(type) {
		case *string:
			*p = "x"
		case *bool:
			*p = r.tts
		case *[]byte:
			if i == lastBytes {
				*p = r.invite
			}
		}
	}
	return nil
}

func TestScanMessageRowReadsCallInvite(t *testing.T) {
	msg, err := scanMessageRow(fakeRow{invite: []byte(`{"call_id":"c1","channel_id":"ch"}`)})
	if err != nil || msg.CallInvite == nil || msg.CallInvite.CallID != "c1" {
		t.Fatalf("msg=%+v err=%v", msg, err)
	}
	plain, err := scanMessageRow(fakeRow{})
	if err != nil || plain.CallInvite != nil {
		t.Fatalf("plain=%+v err=%v", plain, err)
	}
}
