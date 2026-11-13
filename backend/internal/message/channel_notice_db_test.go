package message

import (
	"testing"

	"gin-quickstart/backend/internal/channel"
)

// O aviso vira mensagem de sistema do canal e, mesmo com o modo temporário
// ligado, nasce sem validade (expires_at NULL): o aviso não some.
func TestPostChannelNoticeNaoExpira(t *testing.T) {
	s := newSearchDB(t)
	if _, err := s.db.Exec(s.ctx, `UPDATE channels SET disappearing_seconds = 604800 WHERE id = $1`, s.geral); err != nil {
		t.Fatal(err)
	}
	pub := &noticePublisher{}
	svc := MessageService(MessageRepository(s.db), pub, nil, nil, nil, nil)
	var poster channel.ChannelNoticePoster = svc

	text := "Ana ativou as mensagens temporárias. Novas mensagens vão sumir após 7 dias."
	if err := poster.PostChannelNotice(s.ctx, s.geral, s.users["ana"], text); err != nil {
		t.Fatal(err)
	}
	if len(pub.created) != 1 {
		t.Fatalf("eventos = %d, want 1", len(pub.created))
	}
	var kind *string
	var expired bool
	err := s.db.QueryRow(s.ctx, `SELECT system_kind, expires_at IS NOT NULL FROM messages WHERE id = $1`, pub.created[0].Message.ID).Scan(&kind, &expired)
	if err != nil {
		t.Fatal(err)
	}
	if kind == nil || *kind != "disappearing" || expired {
		t.Fatalf("kind %v, com validade %v", kind, expired)
	}
}
