package message

import (
	"context"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

func ptr(s string) *string { return &s }

func TestValidateViewOnce(t *testing.T) {
	cases := []struct {
		name  string
		atts  []string
		stk   *string
		gif   *string
		valid bool
	}{
		{"sem anexo", nil, nil, nil, false},
		{"dois anexos", []string{"a", "b"}, nil, nil, false},
		{"com figurinha", []string{"a"}, ptr("s"), nil, false},
		{"com GIF", []string{"a"}, nil, ptr("http://g"), false},
		{"um anexo", []string{"a"}, nil, nil, true},
	}
	for _, c := range cases {
		err := validateViewOnce(c.atts, c.stk, c.gif)
		if c.valid && err != nil {
			t.Errorf("%s: erro inesperado %v", c.name, err)
		}
		if !c.valid && !errors.Is(err, ErrInvalidViewOnce) {
			t.Errorf("%s: quero ErrInvalidViewOnce, veio %v", c.name, err)
		}
	}
}

type fakeViewOnceRepo struct {
	recipients []string
	room       Room
	marked     bool
	cleared    []string
	bots       []string
	err        error
}

func (f *fakeViewOnceRepo) MarkViewOnce(_ context.Context, _, _ string, room Room, recipientIDs []string) error {
	f.recipients, f.room, f.marked = recipientIDs, room, true
	return f.err
}

func (f *fakeViewOnceRepo) ClearViewOnce(_ context.Context, ids []string, _ string, room Room) error {
	f.cleared, f.room = ids, room
	return f.err
}

func (f *fakeViewOnceRepo) BotIDs(context.Context, []string) ([]string, error) {
	return f.bots, nil
}

type fakeViewOnceRooms struct{ ids []string }

func (f fakeViewOnceRooms) ConversationParticipantIDs(context.Context, string) ([]string, error) {
	return f.ids, nil
}

func TestPrepareDestinatariosSemAutor(t *testing.T) {
	repo := &fakeViewOnceRepo{}
	svc := NewViewOnceService(repo, fakeViewOnceRooms{ids: []string{"a", "b", "c"}})
	if err := svc.Prepare(context.Background(), Room{ConversationID: "conv"}, "a", []string{"x"}, nil, nil); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(repo.recipients, []string{"b", "c"}) || repo.room != (Room{ConversationID: "conv"}) {
		t.Fatalf("destinatários = %v, sala = %+v", repo.recipients, repo.room)
	}
}

type fakePreparer struct{ err error }

func (f fakePreparer) Prepare(context.Context, Room, string, []string, *string, *string) error {
	return f.err
}

func (f fakePreparer) Clear(context.Context, Room, string, []string) error { return f.err }

func TestCriarDMViewOnceInvalidoDa400(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(ctx *gin.Context) { ctx.Set("userID", "ana"); ctx.Next() }
	h := &Handler{service: &Service{}, access: fakeAccess{}}
	h.SetViewOnce(NewViewOnceService(&fakeViewOnceRepo{}, fakeViewOnceRooms{}))
	MessageRoutes(r.Group("/api"), h, auth)
	rec := postRaw(r, "/api/conversations/dm1/messages", `{"content":"oi","view_once":true}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
}

func TestCriarDMViewOnceErroDoRepoDa400(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(ctx *gin.Context) { ctx.Set("userID", "ana"); ctx.Next() }
	h := &Handler{service: &Service{}, access: fakeAccess{}}
	h.SetViewOnce(fakePreparer{err: ErrInvalidViewOnce})
	MessageRoutes(r.Group("/api"), h, auth)
	rec := postRaw(r, "/api/conversations/dm1/messages", `{"attachment_ids":["x"],"view_once":true}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
}

// Canal sem o recurso ligado: view_once é recusado com 400, nunca ignorado.
func TestCriarCanalViewOnceSemServicoDa400(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(ctx *gin.Context) { ctx.Set("userID", "ana"); ctx.Next() }
	perms := allowAll{perms: membro | permission.AttachFiles}
	MessageRoutes(r.Group("/api"), &Handler{service: &Service{}, perms: perms}, auth)
	rec := postRaw(r, "/api/channels/c1/messages", `{"attachment_ids":["x"],"view_once":true}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
}

// Quem não pode escrever no canal leva o 403 ANTES de qualquer marca: o
// Prepare nem roda.
func TestCriarCanalViewOnceSemEscritaNaoPrepara(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(ctx *gin.Context) { ctx.Set("userID", "ana"); ctx.Next() }
	prep := &countingPreparer{}
	h := &Handler{service: &Service{}, perms: allowAll{perms: permission.ViewChannel}}
	h.SetViewOnce(prep)
	MessageRoutes(r.Group("/api"), h, auth)
	rec := postRaw(r, "/api/channels/c1/messages", `{"attachment_ids":["x"],"view_once":true}`)
	if rec.Code != http.StatusForbidden || prep.calls != 0 {
		t.Fatalf("status %d, Prepare chamado %d vezes; body %s", rec.Code, prep.calls, rec.Body)
	}
}

// A recusa do Prepare no canal vira 400.
func TestCriarCanalViewOnceRecusadoDa400(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(ctx *gin.Context) { ctx.Set("userID", "ana"); ctx.Next() }
	h := &Handler{service: &Service{}, perms: allowAll{perms: membro | permission.AttachFiles}}
	h.SetViewOnce(fakePreparer{err: ErrInvalidViewOnce})
	MessageRoutes(r.Group("/api"), h, auth)
	rec := postRaw(r, "/api/channels/c1/messages", `{"attachment_ids":["x"],"view_once":true}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
}

func TestCriarDMViewOnceErroInternoNaoVaza(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(ctx *gin.Context) { ctx.Set("userID", "ana"); ctx.Next() }
	h := &Handler{service: &Service{}, access: fakeAccess{}}
	h.SetViewOnce(fakePreparer{err: errors.New("pq: segredo do banco")})
	MessageRoutes(r.Group("/api"), h, auth)
	rec := postRaw(r, "/api/conversations/dm1/messages", `{"attachment_ids":["x"],"view_once":true}`)
	if rec.Code != http.StatusInternalServerError || strings.Contains(rec.Body.String(), "segredo") {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
}

type countingPreparer struct {
	calls  int
	clears int
	room   Room
}

func (p *countingPreparer) Clear(_ context.Context, room Room, _ string, _ []string) error {
	p.clears++
	p.room = room
	return nil
}

func (p *countingPreparer) Prepare(_ context.Context, room Room, _ string, _ []string, _, _ *string) error {
	p.calls++
	p.room = room
	return nil
}

// Quem não pode escrever na DM leva o erro de acesso ANTES de qualquer marca
// de visualização única: o Prepare nem roda.
func TestCriarDMViewOnceSemAcessoNaoPrepara(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
	}{
		{"não participa", ErrNoRoomAccess, http.StatusForbidden},
		{"conversa inexistente", ErrRoomNotFound, http.StatusNotFound},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			r := gin.New()
			auth := func(ctx *gin.Context) { ctx.Set("userID", "ana"); ctx.Next() }
			prep := &countingPreparer{}
			h := &Handler{service: &Service{}, access: fakeAccess{writeErr: c.err}}
			h.SetViewOnce(prep)
			MessageRoutes(r.Group("/api"), h, auth)
			rec := postRaw(r, "/api/conversations/dm1/messages", `{"attachment_ids":["x"],"view_once":true}`)
			if rec.Code != c.status || prep.calls != 0 {
				t.Fatalf("status %d (quero %d), Prepare chamado %d vezes; body %s", rec.Code, c.status, prep.calls, rec.Body)
			}
		})
	}
}

// Recurso não ligado: view_once é recusado com 400, nunca ignorado.
func TestCriarDMViewOnceSemServicoDa400(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(ctx *gin.Context) { ctx.Set("userID", "ana"); ctx.Next() }
	MessageRoutes(r.Group("/api"), &Handler{service: &Service{}, access: fakeAccess{}}, auth)
	rec := postRaw(r, "/api/conversations/dm1/messages", `{"attachment_ids":["x"],"view_once":true}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
}
