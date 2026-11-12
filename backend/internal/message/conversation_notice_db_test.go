package message

import "testing"

type noticePublisher struct {
	pinTestPublisher
	created []CreateEvent
}

func (p *noticePublisher) PublishMessageCreate(e CreateEvent) { p.created = append(p.created, e) }

// O aviso vira uma mensagem da conversa com system_kind e é publicado.
func TestPostConversationNoticeGrava(t *testing.T) {
	s := newSearchDB(t)
	pub := &noticePublisher{}
	svc := MessageService(MessageRepository(s.db), pub, nil, nil, nil, nil)

	err := svc.PostConversationNotice(s.ctx, s.convID, s.users["ana"], "Ana ativou as mensagens temporárias.", "disappearing")
	if err != nil {
		t.Fatal(err)
	}
	if len(pub.created) != 1 {
		t.Fatalf("eventos = %d, want 1", len(pub.created))
	}
	got, err := svc.repository.FindByID(s.ctx, pub.created[0].Message.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.SystemKind == nil || *got.SystemKind != "disappearing" || got.Content != "Ana ativou as mensagens temporárias." {
		t.Fatalf("mensagem = kind %v, content %q", got.SystemKind, got.Content)
	}
	if got.ConversationID == nil || *got.ConversationID != s.convID || got.AuthorID != s.users["ana"] {
		t.Fatalf("mensagem na conversa errada: %+v", got)
	}
}
