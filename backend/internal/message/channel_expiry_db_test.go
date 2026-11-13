package message

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func ligarModoCanal(t *testing.T, s *searchDB, segundos any) {
	t.Helper()
	if _, err := s.db.Exec(s.ctx, `UPDATE channels SET disappearing_seconds = $1 WHERE id = $2`, segundos, s.geral); err != nil {
		t.Fatal(err)
	}
}

func enviarNoCanal(t *testing.T, s *searchDB, repo *Repository) *Message {
	t.Helper()
	msg := &Message{ID: uuid.NewString(), AuthorID: s.users["ana"], ChannelID: &s.geral, Content: "no canal"}
	if err := repo.Create(s.ctx, msg); err != nil {
		t.Fatal(err)
	}
	got, err := repo.FindByID(s.ctx, msg.ID)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestMensagemDoCanalComModoLigadoGravaExpiresAt(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	if got := enviarNoCanal(t, s, repo); got.ExpiresAt != nil {
		t.Fatalf("canal sem modo: expires_at = %v", got.ExpiresAt)
	}
	ligarModoCanal(t, s, 86400)
	got := enviarNoCanal(t, s, repo)
	if got.ExpiresAt == nil || !quaseIgual(*got.ExpiresAt, got.CreatedAt.Add(24*time.Hour)) {
		t.Fatalf("expires_at = %v, created_at = %v", got.ExpiresAt, got.CreatedAt)
	}
}

func TestEncaminharParaCanalHerdaValidade(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ligarModoCanal(t, s, 86400)
	msg := &Message{ID: uuid.NewString(), AuthorID: s.users["caio"], ChannelID: &s.geral, Content: "fwd", ForwardedFrom: &ForwardedFrom{MessageID: s.msgs["ola"], AuthorID: s.users["ana"]}}
	if err := repo.CreateForwarded(s.ctx, msg, nil); err != nil {
		t.Fatal(err)
	}
	got, err := repo.FindByID(s.ctx, msg.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ExpiresAt == nil || !quaseIgual(*got.ExpiresAt, got.CreatedAt.Add(24*time.Hour)) {
		t.Fatalf("expires_at = %v", got.ExpiresAt)
	}
}

func TestEnqueteNoCanalENaDMGravaExpiresAt(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ligarModoCanal(t, s, 86400)
	ligarModo(t, s, 86400)
	poll := &Poll{Question: "q?", AllowMultiselect: false, ExpiresAt: time.Now().Add(time.Hour), Answers: []PollAnswer{{AnswerID: 1, Text: "a"}, {AnswerID: 2, Text: "b"}}}
	conv := s.convID
	for nome, msg := range map[string]*Message{
		"canal": {ID: uuid.NewString(), AuthorID: s.users["ana"], ChannelID: &s.geral},
		"dm":    {ID: uuid.NewString(), AuthorID: s.users["ana"], ConversationID: &conv},
	} {
		if err := repo.CreateWithPoll(s.ctx, msg, poll); err != nil {
			t.Fatal(err)
		}
		got, err := repo.FindByID(s.ctx, msg.ID)
		if err != nil {
			t.Fatal(err)
		}
		if got.ExpiresAt == nil || !quaseIgual(*got.ExpiresAt, got.CreatedAt.Add(24*time.Hour)) {
			t.Fatalf("%s: expires_at = %v", nome, got.ExpiresAt)
		}
	}
}

func TestListaEFixadosDoCanalEscondemVencida(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	vencida, viva := uuid.NewString(), uuid.NewString()
	for _, id := range []string{vencida, viva} {
		if _, err := s.db.Exec(s.ctx, `INSERT INTO messages (id, author_id, channel_id, content) VALUES ($1, $2, $3, 'x')`, id, s.users["caio"], s.geral); err != nil {
			t.Fatal(err)
		}
		if _, err := s.db.Exec(s.ctx, `INSERT INTO channel_pinned_messages (channel_id, message_id, pinned_by) VALUES ($1, $2, $3)`, s.geral, id, s.users["ana"]); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.db.Exec(s.ctx, `UPDATE messages SET expires_at = now() - interval '1 minute' WHERE id = $1`, vencida); err != nil {
		t.Fatal(err)
	}

	for _, before := range []string{"", viva} {
		msgs, err := repo.ListByChannel(s.ctx, s.geral, 100, before)
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range msgs {
			if m.ID == vencida {
				t.Fatalf("before=%q: a vencida apareceu na lista", before)
			}
		}
	}
	pins, err := repo.ListPinnedMessages(s.ctx, s.geral)
	if err != nil {
		t.Fatal(err)
	}
	var viu bool
	for _, p := range pins {
		if p.ID == vencida {
			t.Fatal("a vencida apareceu nos fixados")
		}
		viu = viu || p.ID == viva
	}
	if !viu {
		t.Fatal("a mensagem viva devia estar fixada")
	}
	if _, err := repo.GetPinnedMessage(s.ctx, s.geral, vencida); err == nil {
		t.Fatal("GetPinnedMessage(vencida) devia falhar")
	}
}
