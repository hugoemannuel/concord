package proposal

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// CreateComment: resposta, menção e anexo valem juntos ou nada é gravado.
func TestCreateCommentRespostaMencaoEAnexo(t *testing.T) {
	repo, db, newUser, card := archiveEnv(t)
	ctx := context.Background()
	author, other := newUser(), newUser()
	p1, p2 := card(author, "Primeira", StatusDone), card(author, "Segunda", StatusDone)

	first, err := repo.CreateComment(ctx, p1, author, "oi", nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CreateComment(ctx, p2, other, "resposta de outra proposta", nil, &first, nil); !errors.Is(err, ErrInvalidReply) {
		t.Fatalf("resposta a comentário de outra proposta: %v", err)
	}
	id, err := repo.CreateComment(ctx, p1, other, "resposta @autor", []string{author}, &first, nil)
	if err != nil {
		t.Fatal(err)
	}
	c, err := repo.GetComment(ctx, id)
	if err != nil || c.ReplyToID == nil || *c.ReplyToID != first || len(c.Mentions) != 1 {
		t.Fatalf("comentário: %+v %v", c, err)
	}

	att := uuid.NewString()
	if err := repo.CreateCommentAttachment(ctx, CommentAttachmentRow{ID: att, UploaderID: other, Kind: "image", ContentType: "image/png", Filename: "a.png", SizeBytes: 10}); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CreateComment(ctx, p1, author, "anexo de outra pessoa", nil, nil, []string{att}); !errors.Is(err, ErrInvalidAttachment) {
		t.Fatalf("anexo de outro uploader: %v", err)
	}
	var n int
	db.QueryRow(ctx, `SELECT COUNT(*) FROM proposal_comments WHERE body = 'anexo de outra pessoa'`).Scan(&n)
	if n != 0 {
		t.Fatal("o comentário com anexo inválido não podia ser gravado")
	}
	withAtt, err := repo.CreateComment(ctx, p1, other, "com anexo", nil, nil, []string{att})
	if err != nil {
		t.Fatal(err)
	}
	if c, _ := repo.GetComment(ctx, withAtt); len(c.Attachments) != 1 {
		t.Fatalf("anexos = %+v", c.Attachments)
	}
}
