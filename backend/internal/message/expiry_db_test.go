package message

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func ligarModo(t *testing.T, s *searchDB, segundos any) {
	t.Helper()
	if _, err := s.db.Exec(s.ctx, `UPDATE conversations SET disappearing_seconds = $1 WHERE id = $2`, segundos, s.convID); err != nil {
		t.Fatal(err)
	}
}

func enviarNaConversa(t *testing.T, s *searchDB, repo *Repository) *Message {
	t.Helper()
	conv := s.convID
	msg := &Message{ID: uuid.NewString(), AuthorID: s.users["ana"], ConversationID: &conv, Content: "oi"}
	if err := repo.Create(s.ctx, msg); err != nil {
		t.Fatal(err)
	}
	got, err := repo.FindByID(s.ctx, msg.ID)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func quaseIgual(a, b time.Time) bool {
	d := a.Sub(b)
	return d > -5*time.Second && d < 5*time.Second
}

// Com o modo ligado, o prazo nasce no INSERT: created_at + disappearing_seconds.
func TestEnvioComModoLigadoGravaExpiresAt(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ligarModo(t, s, 86400)

	got := enviarNaConversa(t, s, repo)
	if got.ExpiresAt == nil || !quaseIgual(*got.ExpiresAt, got.CreatedAt.Add(24*time.Hour)) {
		t.Fatalf("expires_at = %v, created_at = %v", got.ExpiresAt, got.CreatedAt)
	}
	raw, _ := json.Marshal(got)
	if !strings.Contains(string(raw), `"expires_at"`) {
		t.Fatalf("JSON sem expires_at: %s", raw)
	}
}

// Sem o modo (DM) e em canal, a mensagem não expira.
func TestEnvioSemModoNaoExpira(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)

	if got := enviarNaConversa(t, s, repo); got.ExpiresAt != nil {
		t.Fatalf("DM sem modo: expires_at = %v", got.ExpiresAt)
	}
	ligarModo(t, s, 86400)
	msg := &Message{ID: uuid.NewString(), AuthorID: s.users["ana"], ChannelID: &s.geral, Content: "no canal"}
	if err := repo.Create(s.ctx, msg); err != nil {
		t.Fatal(err)
	}
	got, err := repo.FindByID(s.ctx, msg.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ExpiresAt != nil {
		t.Fatalf("canal: expires_at = %v", got.ExpiresAt)
	}
}

// O caminho com anexos (CreateWithAttachments) também grava o prazo.
func TestEnvioComAnexoTambemExpira(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ligarModo(t, s, 604800)
	conv := s.convID
	att := storedAttachment{
		Attachment: Attachment{ID: uuid.NewString(), Kind: "image", ContentType: "image/png", Filename: "a.png", SizeBytes: 10},
		UploaderID: s.users["ana"], ConversationID: &conv,
	}
	if err := repo.CreatePendingAttachment(s.ctx, &att); err != nil {
		t.Fatal(err)
	}
	msg := &Message{ID: uuid.NewString(), AuthorID: s.users["ana"], ConversationID: &conv}
	if err := repo.CreateWithAttachments(s.ctx, msg, []string{att.ID}); err != nil {
		t.Fatal(err)
	}
	got, err := repo.FindByID(s.ctx, msg.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ExpiresAt == nil || !quaseIgual(*got.ExpiresAt, got.CreatedAt.Add(7*24*time.Hour)) {
		t.Fatalf("expires_at = %v, created_at = %v", got.ExpiresAt, got.CreatedAt)
	}
}

// D4: desligar o modo não mexe no prazo das mensagens já enviadas.
func TestDesligarNaoMudaAntigas(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ligarModo(t, s, 86400)
	antes := enviarNaConversa(t, s, repo)
	ligarModo(t, s, nil)

	depois, err := repo.FindByID(s.ctx, antes.ID)
	if err != nil {
		t.Fatal(err)
	}
	if antes.ExpiresAt == nil || depois.ExpiresAt == nil || !antes.ExpiresAt.Equal(*depois.ExpiresAt) {
		t.Fatalf("antes = %v, depois = %v", antes.ExpiresAt, depois.ExpiresAt)
	}
	if novo := enviarNaConversa(t, s, repo); novo.ExpiresAt != nil {
		t.Fatalf("mensagem nova com modo desligado: expires_at = %v", novo.ExpiresAt)
	}
}

// D14: a cópia encaminhada segue o modo da conversa de destino.
func TestEncaminharSegueModoDoDestino(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ligarModo(t, s, 86400)
	conv := s.convID
	msg := &Message{ID: uuid.NewString(), AuthorID: s.users["caio"], ConversationID: &conv, Content: "fwd", ForwardedFrom: &ForwardedFrom{MessageID: s.msgs["ola"], AuthorID: s.users["ana"]}}
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

// D5: o aviso de sistema não expira, mesmo com o modo ligado.
func TestPostConversationNoticeNaoExpira(t *testing.T) {
	s := newSearchDB(t)
	ligarModo(t, s, 86400)
	pub := &noticePublisher{}
	svc := MessageService(MessageRepository(s.db), pub, nil, nil, nil, nil)

	if err := svc.PostConversationNotice(s.ctx, s.convID, s.users["ana"], "Ana ativou as mensagens temporárias.", "disappearing"); err != nil {
		t.Fatal(err)
	}
	if len(pub.created) != 1 {
		t.Fatalf("eventos = %d, want 1", len(pub.created))
	}
	got, err := svc.repository.FindByID(s.ctx, pub.created[0].Message.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ExpiresAt != nil {
		t.Fatalf("aviso com expires_at = %v", got.ExpiresAt)
	}
}
