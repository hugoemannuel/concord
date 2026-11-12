package message

import (
	"context"
	"errors"
	"net/http"
	"reflect"
	"testing"

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
	err        error
}

func (f *fakeViewOnceRepo) MarkViewOnce(_ context.Context, _, _, _ string, recipientIDs []string) error {
	f.recipients = recipientIDs
	return f.err
}

type fakeViewOnceRooms struct{ ids []string }

func (f fakeViewOnceRooms) ConversationParticipantIDs(context.Context, string) ([]string, error) {
	return f.ids, nil
}

func TestPrepareDestinatariosSemAutor(t *testing.T) {
	repo := &fakeViewOnceRepo{}
	svc := NewViewOnceService(repo, fakeViewOnceRooms{ids: []string{"a", "b", "c"}})
	if err := svc.Prepare(context.Background(), "conv", "a", []string{"x"}, nil, nil); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(repo.recipients, []string{"b", "c"}) {
		t.Fatalf("destinatários = %v", repo.recipients)
	}
}

type fakePreparer struct{ err error }

func (f fakePreparer) Prepare(context.Context, string, string, []string, *string, *string) error {
	return f.err
}

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
