package message

import (
	"context"
	"testing"
	"time"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

func contarDestinatarios(t *testing.T, s *searchDB, att string) []string {
	t.Helper()
	return destinatariosGravados(t, s, att)
}

// Reenvio depois de um 429: os destinatários são os do último envio, não a união.
func TestMarkViewOnceReenvioSubstituiDestinatarios(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ana, bia, caio := s.users["ana"], s.users["bia"], s.users["caio"]
	id := anexoPendente(t, s, repo, ana, "image")
	room := Room{ConversationID: s.convID}
	if err := repo.MarkViewOnce(s.ctx, id, ana, room, []string{bia, caio}); err != nil {
		t.Fatal(err)
	}
	if err := repo.MarkViewOnce(s.ctx, id, ana, room, []string{bia}); err != nil {
		t.Fatal(err)
	}
	if got := contarDestinatarios(t, s, id); len(got) != 1 || got[0] != bia {
		t.Fatalf("destinatários = %v, quero só %s", got, bia)
	}
}

func TestClearViewOnceDesmarcaPendenteDoAutor(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ana, bia := s.users["ana"], s.users["bia"]
	room := Room{ConversationID: s.convID}
	id := anexoPendente(t, s, repo, ana, "image")
	if err := repo.MarkViewOnce(s.ctx, id, ana, room, []string{bia}); err != nil {
		t.Fatal(err)
	}
	// de outro usuário e de outra sala: não toca
	if err := repo.ClearViewOnce(s.ctx, []string{id}, bia, room); err != nil {
		t.Fatal(err)
	}
	if err := repo.ClearViewOnce(s.ctx, []string{id}, ana, Room{ChannelID: s.geral}); err != nil {
		t.Fatal(err)
	}
	var vo bool
	s.db.QueryRow(s.ctx, `SELECT view_once FROM message_attachments WHERE id = $1`, id).Scan(&vo)
	if !vo || len(contarDestinatarios(t, s, id)) != 1 {
		t.Fatalf("marca perdida por quem não podia: view_once=%v", vo)
	}
	if err := repo.ClearViewOnce(s.ctx, []string{id}, ana, room); err != nil {
		t.Fatal(err)
	}
	s.db.QueryRow(s.ctx, `SELECT view_once FROM message_attachments WHERE id = $1`, id).Scan(&vo)
	if vo || len(contarDestinatarios(t, s, id)) != 0 {
		t.Fatalf("view_once=%v destinatários=%v", vo, contarDestinatarios(t, s, id))
	}
}

func TestClearViewOnceNaoTocaAnexoJaEnviado(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ana, bia := s.users["ana"], s.users["bia"]
	_, att := enviarViewOnce(t, s, repo, bia)
	if err := repo.ClearViewOnce(s.ctx, []string{att}, ana, Room{ConversationID: s.convID}); err != nil {
		t.Fatal(err)
	}
	var vo bool
	s.db.QueryRow(s.ctx, `SELECT view_once FROM message_attachments WHERE id = $1`, att).Scan(&vo)
	if !vo {
		t.Fatal("anexo já enviado perdeu a marca")
	}
}

// Visualização única com mensagem vencida (ainda não varrida) não abre nem serve.
func TestFindAttachmentViewOnceVencidoSomeComoInexistente(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	msgID, att := enviarViewOnce(t, s, repo, s.users["bia"])
	if _, err := repo.FindAttachment(s.ctx, att); err != nil {
		t.Fatalf("antes de vencer: %v", err)
	}
	if _, err := s.db.Exec(s.ctx, `UPDATE messages SET expires_at = $2 WHERE id = $1`, msgID, time.Now().Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.FindAttachment(s.ctx, att); err != ErrAttachmentNotFound {
		t.Fatalf("err = %v, quero ErrAttachmentNotFound", err)
	}
}

func TestViewOnceServiceClearSemAnexoNaoVaiAoBanco(t *testing.T) {
	repo := &fakeViewOnceRepo{}
	svc := NewViewOnceService(repo, nil)
	if err := svc.Clear(context.Background(), Room{ConversationID: "c"}, "a", nil); err != nil || repo.cleared != nil {
		t.Fatalf("err=%v cleared=%v", err, repo.cleared)
	}
	if err := svc.Clear(context.Background(), Room{ConversationID: "c"}, "a", []string{"x"}); err != nil || len(repo.cleared) != 1 {
		t.Fatalf("err=%v cleared=%v", err, repo.cleared)
	}
}

// Envio comum com anexo limpa a marca; sem anexo ou com o olho ligado não.
func TestCriarMensagemSemViewOnceLimpaMarcaAnterior(t *testing.T) {
	cases := []struct {
		name, path, body string
		clears           int
	}{
		{"dm com anexo", "/api/conversations/dm1/messages", `{"attachment_ids":["x"]}`, 1},
		{"dm sem anexo", "/api/conversations/dm1/messages", `{"content":"oi"}`, 0},
		{"canal com anexo", "/api/channels/c1/messages", `{"attachment_ids":["x"]}`, 1},
		{"canal sem anexo", "/api/channels/c1/messages", `{"content":"oi"}`, 0},
		{"dm com olho", "/api/conversations/dm1/messages", `{"attachment_ids":["x"],"view_once":true}`, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			r := gin.New()
			r.Use(gin.Recovery()) // a criação real não está ligada: o que importa é o Clear
			auth := func(ctx *gin.Context) { ctx.Set("userID", "ana"); ctx.Next() }
			prep := &countingPreparer{}
			h := &Handler{service: &Service{}, access: fakeAccess{}, perms: allowAll{perms: membro | permission.AttachFiles}}
			h.SetViewOnce(prep)
			MessageRoutes(r.Group("/api"), h, auth)
			rec := postRaw(r, c.path, c.body)
			if prep.clears != c.clears {
				t.Fatalf("status %d, Clear %d vezes (quero %d); body %s", rec.Code, prep.clears, c.clears, rec.Body)
			}
		})
	}
}
