package message

import (
	"errors"
	"testing"

	"github.com/google/uuid"
)

// anexoPendente grava um anexo ainda sem mensagem na conversa do teste.
func anexoPendente(t *testing.T, s *searchDB, repo *Repository, uploader, kind string) string {
	t.Helper()
	conv := s.convID
	a := &storedAttachment{
		Attachment:     Attachment{ID: uuid.NewString(), Kind: kind, ContentType: "application/octet-stream", Filename: "f", SizeBytes: 1},
		UploaderID:     uploader,
		ConversationID: &conv,
	}
	if err := repo.CreatePendingAttachment(s.ctx, a); err != nil {
		t.Fatal(err)
	}
	return a.ID
}

func TestMarkViewOnceRecusaAudioEJaEnviado(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ana, bia := s.users["ana"], s.users["bia"]
	rec := []string{bia}

	for _, kind := range []string{"audio", "file"} {
		id := anexoPendente(t, s, repo, ana, kind)
		if err := repo.MarkViewOnce(s.ctx, id, ana, s.convID, rec); !errors.Is(err, ErrInvalidViewOnce) {
			t.Errorf("%s: err = %v", kind, err)
		}
	}
	outro := anexoPendente(t, s, repo, bia, "image")
	if err := repo.MarkViewOnce(s.ctx, outro, ana, s.convID, rec); !errors.Is(err, ErrInvalidViewOnce) {
		t.Errorf("de outro usuário: err = %v", err)
	}
	enviado := anexoPendente(t, s, repo, ana, "image")
	msg := enviarNaConversa(t, s, repo)
	if _, err := s.db.Exec(s.ctx, `UPDATE message_attachments SET message_id = $1 WHERE id = $2`, msg.ID, enviado); err != nil {
		t.Fatal(err)
	}
	if err := repo.MarkViewOnce(s.ctx, enviado, ana, s.convID, rec); !errors.Is(err, ErrInvalidViewOnce) {
		t.Errorf("já enviado: err = %v", err)
	}
	outraConversa := anexoPendente(t, s, repo, ana, "image")
	if err := repo.MarkViewOnce(s.ctx, outraConversa, ana, uuid.NewString(), rec); !errors.Is(err, ErrInvalidViewOnce) {
		t.Errorf("outra conversa: err = %v", err)
	}
}

func TestMarkViewOnceGravaDestinatarios(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ana, bia, caio := s.users["ana"], s.users["bia"], s.users["caio"]
	id := anexoPendente(t, s, repo, ana, "video")
	if err := repo.MarkViewOnce(s.ctx, id, ana, s.convID, []string{bia, caio}); err != nil {
		t.Fatal(err)
	}
	var vo bool
	var n int
	s.db.QueryRow(s.ctx, `SELECT view_once FROM message_attachments WHERE id = $1`, id).Scan(&vo)
	s.db.QueryRow(s.ctx, `SELECT count(*) FROM view_once_recipients WHERE attachment_id = $1`, id).Scan(&n)
	if !vo || n != 2 {
		t.Fatalf("view_once=%v destinatários=%d", vo, n)
	}
}

// Foco de revisão 3: se o envio falha depois de marcar, o anexo continua
// pendente (sem mensagem) e o Janitor o apaga; nada vaza.
func TestEnvioFalhaDepoisDeMarcarDeixaPendente(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ana, bia := s.users["ana"], s.users["bia"]
	id := anexoPendente(t, s, repo, ana, "image")
	if err := repo.MarkViewOnce(s.ctx, id, ana, s.convID, []string{bia}); err != nil {
		t.Fatal(err)
	}
	// criação da mensagem falha (ex.: texto grande demais): nada é ligado ao anexo
	conv := s.convID
	long := make([]byte, MaxMessageLength+1)
	for i := range long {
		long[i] = 'a'
	}
	msg := &Message{ID: uuid.NewString(), AuthorID: ana, ConversationID: &conv, Content: string(long)}
	if err := repo.CreateWithAttachments(s.ctx, msg, []string{id}); err == nil {
		t.Fatal("esperava falha na criação")
	}
	var mid *string
	if err := s.db.QueryRow(s.ctx, `SELECT message_id FROM message_attachments WHERE id = $1`, id).Scan(&mid); err != nil {
		t.Fatal(err)
	}
	if mid != nil {
		t.Fatalf("message_id = %v; quero NULL", *mid)
	}
}
