package message

import "testing"

// O alerta crítico (ADR 0071) sai como mensagem de sistema que pinga todo
// mundo: mention_everyone = all no banco e no evento (é o que o push lê).
func TestPostSystemNoticeMentionAll(t *testing.T) {
	s := newSearchDB(t)
	pub := &noticePublisher{}
	svc := MessageService(MessageRepository(s.db), pub, nil, nil, nil, nil)

	for _, tt := range []struct {
		mentionAll bool
		want       *string
	}{{true, ptr(MentionAll)}, {false, nil}} {
		msg, err := svc.PostSystemNotice(s.ctx, SystemNotice{ChannelID: s.geral, AuthorID: s.users["robo"], Content: "@all Crítico: x", Kind: "alert", MentionAll: tt.mentionAll})
		if err != nil {
			t.Fatal(err)
		}
		var stored *string
		if err := s.db.QueryRow(s.ctx, `SELECT mention_everyone FROM messages WHERE id = $1`, msg.ID).Scan(&stored); err != nil {
			t.Fatal(err)
		}
		if !sameString(stored, tt.want) || !sameString(msg.MentionEveryone, tt.want) {
			t.Errorf("MentionAll=%v: banco %v, mensagem %v", tt.mentionAll, stored, msg.MentionEveryone)
		}
	}
	if len(pub.created) != 2 || pub.created[0].Message.SystemKind == nil || *pub.created[0].Message.SystemKind != "alert" {
		t.Fatalf("eventos = %+v", pub.created)
	}
}

func sameString(a, b *string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}
