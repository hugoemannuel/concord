package message

import (
	"context"
	"errors"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/google/uuid"
)

// CreateForwarded num Postgres de verdade (TEST_DATABASE_URL): a mensagem, a
// origem em forwarded_from e as cópias dos anexos já ligadas a ela.
func TestCreateForwardedGravaOrigemEAnexos(t *testing.T) {
	db := newSearchDB(t)
	repo := MessageRepository(db.db)
	conv := db.convID
	origin := &ForwardedFrom{
		MessageID: db.msgs["ola"], AuthorID: db.users["ana"], AuthorName: "Ana",
		ChannelID: &db.geral, ChannelName: "Geral", ServerID: &db.serverID, ServerName: "s",
		CreatedAt: time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC),
	}
	msg := &Message{ID: uuid.NewString(), AuthorID: db.users["caio"], ConversationID: &conv, Content: "Olá, pessoal!", ForwardedFrom: origin, EmbedsSuppressed: true}
	width := 640
	att := storedAttachment{
		Attachment: Attachment{ID: uuid.NewString(), Kind: "image", ContentType: "image/png", Filename: "foto.png", SizeBytes: 10, Width: &width},
		UploaderID: db.users["caio"], ConversationID: &conv,
	}

	if err := repo.CreateForwarded(db.ctx, msg, []storedAttachment{att}); err != nil {
		t.Fatalf("CreateForwarded: %v", err)
	}
	got, err := repo.FindByID(db.ctx, msg.ID)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	ff := got.ForwardedFrom
	if ff == nil || ff.MessageID != origin.MessageID || ff.AuthorName != "Ana" || ff.ChannelName != "Geral" || !ff.CreatedAt.Equal(origin.CreatedAt) {
		t.Fatalf("forwarded_from = %+v", ff)
	}
	if !got.EmbedsSuppressed || got.Content != "Olá, pessoal!" {
		t.Fatalf("mensagem = %+v", got)
	}
	page := []Message{*got}
	if err := repo.AttachAttachments(db.ctx, page); err != nil {
		t.Fatal(err)
	}
	if len(page[0].Attachments) != 1 || page[0].Attachments[0].ID != att.ID || *page[0].Attachments[0].Width != 640 {
		t.Fatalf("anexos = %+v", page[0].Attachments)
	}

	plain, err := repo.FindByID(db.ctx, db.msgs["ola"])
	if err != nil || plain.ForwardedFrom != nil {
		t.Fatalf("mensagem comum: %+v, %v", plain, err)
	}
}

func TestCreateForwardedAnexoInvalidoNaoGravaNada(t *testing.T) {
	db := newSearchDB(t)
	repo := MessageRepository(db.db)
	conv := db.convID
	msg := &Message{ID: uuid.NewString(), AuthorID: db.users["caio"], ConversationID: &conv, Content: "x", ForwardedFrom: &ForwardedFrom{MessageID: "m"}}
	bad := storedAttachment{Attachment: Attachment{ID: uuid.NewString(), Kind: "nada", ContentType: "x", Filename: "x", SizeBytes: 1}, UploaderID: db.users["caio"], ConversationID: &conv}

	if err := repo.CreateForwarded(db.ctx, msg, []storedAttachment{bad}); err == nil {
		t.Fatal("anexo inválido precisa falhar")
	}
	if _, err := repo.FindByID(db.ctx, msg.ID); err == nil {
		t.Fatal("a transação não pode deixar a mensagem")
	}
}

// Achado da revisão final: FindByID não carrega view_once; a checagem precisa
// rodar depois de AttachAttachments, senão a legenda é encaminhada.
func TestForwardRecusaVisualizacaoUnicaComLegendaNoBanco(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ana, caio := s.users["ana"], s.users["caio"]
	att := anexoPendente(t, s, repo, ana, "image")
	if err := repo.MarkViewOnce(s.ctx, att, ana, s.convID, []string{caio}); err != nil {
		t.Fatal(err)
	}
	conv := s.convID
	msg := &Message{ID: uuid.NewString(), AuthorID: ana, ConversationID: &conv, Content: "olha só"}
	if err := repo.CreateWithAttachments(s.ctx, msg, []string{att}); err != nil {
		t.Fatal(err)
	}
	files, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	f := NewForwarder(ForwarderDeps{
		Store:     repo,
		Files:     files,
		Space:     fakeSpace{ok: true},
		Rooms:     NewForwardRooms(fakeAccess{}, allowAll{sender}),
		Directory: fakeForwardDirectory{},
		Comments:  &fakeComments{},
		Events:    NewRoomEvents(&createPublisher{}, fakeRooms{}, fakeRooms{}),
	})
	req := ForwardRequest{Origin: Room{ConversationID: conv}, MessageID: msg.ID, UserID: caio, Target: Room{ConversationID: conv}}
	if _, err := f.Forward(context.Background(), req); !errors.Is(err, ErrNotForwardable) {
		t.Fatalf("err = %v; quero ErrNotForwardable", err)
	}
}
