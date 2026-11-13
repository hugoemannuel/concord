package message

import (
	"errors"
	"net/http"
	"sort"
	"testing"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// anexoPendenteNoCanal grava um anexo ainda sem mensagem num canal do teste.
func anexoPendenteNoCanal(t *testing.T, s *searchDB, repo *Repository, uploader, channelID string) string {
	t.Helper()
	ch := channelID
	a := &storedAttachment{
		Attachment: Attachment{ID: uuid.NewString(), Kind: "image", ContentType: "image/png", Filename: "f.png", SizeBytes: 1},
		UploaderID: uploader,
		ChannelID:  &ch,
	}
	if err := repo.CreatePendingAttachment(s.ctx, a); err != nil {
		t.Fatal(err)
	}
	return a.ID
}

func destinatariosGravados(t *testing.T, s *searchDB, attachmentID string) []string {
	t.Helper()
	rows, err := s.db.Query(s.ctx, `SELECT user_id::text FROM view_once_recipients WHERE attachment_id = $1`, attachmentID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func TestMarkViewOnceNoCanal(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ana, bia := s.users["ana"], s.users["bia"]
	id := anexoPendenteNoCanal(t, s, repo, ana, s.geral)
	if err := repo.MarkViewOnce(s.ctx, id, ana, Room{ChannelID: s.geral}, []string{bia}); err != nil {
		t.Fatal(err)
	}
	if got := destinatariosGravados(t, s, id); len(got) != 1 || got[0] != bia {
		t.Fatalf("destinatários = %v", got)
	}

	// Anexo de outro canal, ou do canal pedido como se fosse conversa: recusado.
	outro := anexoPendenteNoCanal(t, s, repo, ana, s.segredo)
	if err := repo.MarkViewOnce(s.ctx, outro, ana, Room{ChannelID: s.geral}, []string{bia}); !errors.Is(err, ErrInvalidViewOnce) {
		t.Errorf("outro canal: err = %v", err)
	}
	if err := repo.MarkViewOnce(s.ctx, outro, ana, Room{ConversationID: s.convID}, []string{bia}); !errors.Is(err, ErrInvalidViewOnce) {
		t.Errorf("canal como conversa: err = %v", err)
	}
	daDM := anexoPendente(t, s, repo, ana, "image")
	if err := repo.MarkViewOnce(s.ctx, daDM, ana, Room{ChannelID: s.geral}, []string{bia}); !errors.Is(err, ErrInvalidViewOnce) {
		t.Errorf("anexo da DM no canal: err = %v", err)
	}
	if err := repo.MarkViewOnce(s.ctx, daDM, ana, Room{}, []string{bia}); !errors.Is(err, ErrInvalidViewOnce) {
		t.Errorf("sala vazia: err = %v", err)
	}
}

// Envio de ponta a ponta no canal: 201, e os destinatários são quem vê o
// canal, sem o autor e sem o bot.
func TestCriarCanalViewOnceDa201(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	ana := s.users["ana"]
	att := anexoPendenteNoCanal(t, s, repo, ana, s.geral)

	perms := allowAll{perms: membro | permission.AttachFiles}
	vo := NewViewOnceService(repo, nil)
	geral := &channel.Channel{ID: s.geral, ServerID: s.serverID, Type: channel.TypeText, AllowViewOnce: true}
	vo.SetChannels(fakeViewOnceChannels{s.geral: geral}, permission.PermissionService(permission.PermissionRepository(s.db)))
	h := &Handler{service: MessageService(repo, &captureCreates{}, nil, nil, nil, perms), perms: perms}
	h.SetViewOnce(vo)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	MessageRoutes(r.Group("/api"), h, func(c *gin.Context) { c.Set("userID", ana); c.Next() })

	rec := postRaw(r, "/api/channels/"+s.geral+"/messages", `{"attachment_ids":["`+att+`"],"view_once":true}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
	want := []string{s.users["bia"], s.users["caio"]}
	sort.Strings(want)
	if got := destinatariosGravados(t, s, att); len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("destinatários = %v, quero %v", got, want)
	}
}
