package message

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// SuppressEmbeds no repositório falso da edição (edit_test.go).
func (s *fakeEditStore) SuppressEmbeds(_ context.Context, id, authorID string) error {
	m, ok := s.msgs[id]
	if !ok || m.AuthorID != authorID {
		return ErrMessageNotFound
	}
	s.updates++
	m.EmbedsSuppressed = true
	return nil
}

func suppressEnv(msgs ...*Message) (*EmbedSuppressor, *fakeEditStore, *fakePublisher) {
	store := newFakeEditStore(msgs...)
	pub := &fakePublisher{}
	return NewEmbedSuppressor(store, pub, fakeRooms{}, fakeRooms{}), store, pub
}

func suppressRouter(s *EmbedSuppressor, userID string, perms PermissionChecker, access RoomAccess) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	SuppressEmbedsRoutes(router.Group("/api"), NewSuppressEmbedsHandler(s, perms, access), func(c *gin.Context) {
		c.Set("userID", userID)
		c.Next()
	})
	return router
}

func post(router *gin.Engine, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, nil))
	return rec
}

func TestSuppressEmbedsAutorNoCanal(t *testing.T) {
	member := allowAll{permission.ViewChannel | permission.SendMessages}
	s, _, pub := suppressEnv(channelMsg("m1", "ana", "olha https://buser.com.br"))

	rec := post(suppressRouter(s, "ana", member, fakeAccess{}), "/api/channels/geral/messages/m1/suppress-embeds")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var got Message
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if !got.EmbedsSuppressed {
		t.Fatalf("resposta sem embeds_suppressed: %s", rec.Body)
	}
	if len(pub.updates) != 1 || !pub.updates[0].Message.EmbedsSuppressed || pub.updates[0].ServerID != "s1" {
		t.Fatalf("message:update = %+v", pub.updates)
	}
}

func TestSuppressEmbedsOutraPessoaRecebe403(t *testing.T) {
	member := allowAll{permission.ViewChannel | permission.SendMessages}
	s, store, pub := suppressEnv(channelMsg("m1", "ana", "https://a.com"))

	rec := post(suppressRouter(s, "bia", member, fakeAccess{}), "/api/channels/geral/messages/m1/suppress-embeds")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status %d, want 403", rec.Code)
	}
	if store.updates != 0 || len(pub.updates) != 0 {
		t.Fatal("negado não grava nem publica")
	}
}

func TestSuppressEmbedsOutraSalaOuInexistente404(t *testing.T) {
	member := allowAll{permission.ViewChannel | permission.SendMessages}
	s, _, _ := suppressEnv(convMsg("d1", "ana", "https://a.com"))
	router := suppressRouter(s, "ana", member, fakeAccess{})

	for _, path := range []string{"/api/channels/geral/messages/d1/suppress-embeds", "/api/channels/geral/messages/nada/suppress-embeds"} {
		if rec := post(router, path); rec.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404", path, rec.Code)
		}
	}
}

func TestSuppressEmbedsSemVerOCanal(t *testing.T) {
	s, _, _ := suppressEnv(channelMsg("m1", "ana", "https://a.com"))
	rec := post(suppressRouter(s, "ana", allowAll{}, fakeAccess{}), "/api/channels/geral/messages/m1/suppress-embeds")
	if rec.Code == http.StatusOK {
		t.Fatalf("sem acesso ao canal: status %d", rec.Code)
	}
}

func TestSuppressEmbedsNaDMERepetirNaoPublicaDeNovo(t *testing.T) {
	s, store, pub := suppressEnv(convMsg("d1", "ana", "https://a.com"))
	router := suppressRouter(s, "ana", allowAll{}, fakeAccess{})

	for i := 0; i < 2; i++ {
		if rec := post(router, "/api/conversations/dm1/messages/d1/suppress-embeds"); rec.Code != http.StatusOK {
			t.Fatalf("pedido %d: status %d: %s", i+1, rec.Code, rec.Body)
		}
	}
	if store.updates != 1 || len(pub.updates) != 1 {
		t.Fatalf("gravou %d e publicou %d, want 1 e 1", store.updates, len(pub.updates))
	}
	if ev := pub.updates[0]; len(ev.UserIDs) != 2 || ev.ConversationID == nil {
		t.Fatalf("evento da DM = %+v", ev)
	}
}

func TestSuppressEmbedsDMBloqueada(t *testing.T) {
	s, _, _ := suppressEnv(convMsg("d1", "ana", "https://a.com"))
	rec := post(suppressRouter(s, "ana", allowAll{}, fakeAccess{writeErr: ErrBlocked}), "/api/conversations/dm1/messages/d1/suppress-embeds")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status %d, want 403", rec.Code)
	}
}
