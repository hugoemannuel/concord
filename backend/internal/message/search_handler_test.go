package message

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

const (
	searchServerID = "11111111-1111-4111-8111-111111111111"
	searchConvID   = "22222222-2222-4222-8222-222222222222"
)

type fakeSearchStore struct {
	calls  int
	scope  SearchScope
	filter SearchFilter
}

func (s *fakeSearchStore) Search(_ context.Context, scope SearchScope, f SearchFilter, _ string) (*SearchPage, error) {
	s.calls++
	s.scope, s.filter = scope, f
	return &SearchPage{Results: []SearchResult{}}, nil
}

func newSearchRouter(store *fakeSearchStore, access RoomAccess, userID string) (*gin.Engine, *SearchHandler) {
	gin.SetMode(gin.TestMode)
	snap := permission.NewSnapshot(searchServerID, "dono", permission.DefaultEveryone).
		WithRole("vip", 1, 0).
		WithMember("dono").
		WithMember("ana").
		WithMember("vip", "vip").
		WithChannel("geral", permission.ChannelText).
		WithChannel("segredo", permission.ChannelText,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel},
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: permission.ViewChannel},
		).
		// Sem regra nenhuma no canal: só a categoria privada o esconde.
		WithCategory("privada",
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel},
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: permission.ViewChannel},
		).
		WithChannel("na-categoria", permission.ChannelText).
		InCategory("na-categoria", "privada")
	perms := permission.NewService(&permission.StaticStore{Snapshots: map[string]*permission.Snapshot{searchServerID: snap}})
	h := NewSearchHandler(store, perms, access)
	r := gin.New()
	auth := func(c *gin.Context) {
		if userID != "" {
			c.Set("userID", userID)
		}
		c.Next()
	}
	SearchRoutes(r.Group("/api"), h, auth)
	return r, h
}

func doSearch(r *gin.Engine, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

// Canal escondido nunca entra no escopo da busca, nem pedido pelo in:.
func TestSearchServerOnlyVisibleChannels(t *testing.T) {
	store := &fakeSearchStore{}
	r, _ := newSearchRouter(store, fakeAccess{}, "ana")
	w := doSearch(r, "/api/servers/"+searchServerID+"/messages/search?q=oi+in:segredo")
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if !reflect.DeepEqual(store.scope.ChannelIDs, []string{"geral"}) {
		t.Errorf("escopo da ana = %v, want só geral", store.scope.ChannelIDs)
	}

	store = &fakeSearchStore{}
	r, _ = newSearchRouter(store, fakeAccess{}, "vip")
	doSearch(r, "/api/servers/"+searchServerID+"/messages/search?q=oi")
	if !reflect.DeepEqual(store.scope.ChannelIDs, []string{"geral", "na-categoria", "segredo"}) {
		t.Errorf("escopo do vip = %v", store.scope.ChannelIDs)
	}
}

// Busca não acha canal de categoria privada, nem pedido pelo nome.
func TestSearchSkipsChannelsOfPrivateCategory(t *testing.T) {
	store := &fakeSearchStore{}
	r, _ := newSearchRouter(store, fakeAccess{}, "ana")
	w := doSearch(r, "/api/servers/"+searchServerID+"/messages/search?q=oi+in:na-categoria")
	if w.Code != http.StatusOK || reflect.DeepEqual(store.scope.ChannelIDs, []string{"na-categoria"}) {
		t.Fatalf("status %d, escopo %v", w.Code, store.scope.ChannelIDs)
	}
	for _, id := range store.scope.ChannelIDs {
		if id == "na-categoria" {
			t.Fatalf("escopo da ana: %v", store.scope.ChannelIDs)
		}
	}
}

func TestSearchServerRejectsNonMembers(t *testing.T) {
	for _, path := range []string{
		"/api/servers/" + searchServerID + "/messages/search?q=oi",
		"/api/servers/33333333-3333-4333-8333-333333333333/messages/search?q=oi",
		"/api/servers/nao-e-uuid/messages/search?q=oi",
	} {
		store := &fakeSearchStore{}
		r, _ := newSearchRouter(store, fakeAccess{}, "estranho")
		w := doSearch(r, path)
		if w.Code != http.StatusNotFound || store.calls != 0 {
			t.Errorf("%s: status %d, buscas %d; want 404 sem buscar", path, w.Code, store.calls)
		}
	}
}

func TestSearchConversationAccess(t *testing.T) {
	store := &fakeSearchStore{}
	r, _ := newSearchRouter(store, fakeAccess{readErr: ErrNoRoomAccess}, "ana")
	w := doSearch(r, "/api/conversations/"+searchConvID+"/messages/search?q=oi")
	if w.Code != http.StatusNotFound || store.calls != 0 {
		t.Fatalf("fora da conversa: status %d, buscas %d; want 404", w.Code, store.calls)
	}

	store = &fakeSearchStore{}
	r, _ = newSearchRouter(store, fakeAccess{}, "ana")
	w = doSearch(r, "/api/conversations/"+searchConvID+"/messages/search?q=oi+in:geral&has=link")
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if store.scope.ConversationID != searchConvID || len(store.scope.ChannelIDs) != 0 {
		t.Errorf("escopo = %+v", store.scope)
	}
	if store.filter.In != nil || !reflect.DeepEqual(store.filter.Has, []string{HasLink}) {
		t.Errorf("filtro = %+v (in: não vale numa DM)", store.filter)
	}
}

func TestSearchValidation(t *testing.T) {
	store := &fakeSearchStore{}
	r, _ := newSearchRouter(store, fakeAccess{}, "ana")
	cases := map[string]string{
		"/api/servers/" + searchServerID + "/messages/search":                  "empty_search",
		"/api/servers/" + searchServerID + "/messages/search?q=from:":          "empty_search",
		"/api/conversations/" + searchConvID + "/messages/search?q=in:geral":   "empty_search",
		"/api/servers/" + searchServerID + "/messages/search?q=has:holograma":  "invalid_search",
		"/api/servers/" + searchServerID + "/messages/search?q=oi&sort=random": "invalid_search",
	}
	for path, code := range cases {
		w := doSearch(r, path)
		var body struct{ Code string }
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		if w.Code != http.StatusBadRequest || body.Code != code {
			t.Errorf("%s: %d %s, want 400 %s", path, w.Code, body.Code, code)
		}
	}
	if store.calls != 0 {
		t.Errorf("busca inválida chegou no banco %d vezes", store.calls)
	}

	r, _ = newSearchRouter(store, fakeAccess{}, "")
	if w := doSearch(r, "/api/servers/"+searchServerID+"/messages/search?q=oi"); w.Code != http.StatusUnauthorized {
		t.Errorf("sem login: %d", w.Code)
	}
}

func TestSearchRateLimit(t *testing.T) {
	store := &fakeSearchStore{}
	r, _ := newSearchRouter(store, fakeAccess{}, "ana")
	path := "/api/servers/" + searchServerID + "/messages/search?q=oi"
	for i := 0; i < searchPerUser; i++ {
		if w := doSearch(r, path); w.Code != http.StatusOK {
			t.Fatalf("busca %d: %d", i+1, w.Code)
		}
	}
	w := doSearch(r, path)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Errorf("acima do limite: %d (Retry-After %q)", w.Code, w.Header().Get("Retry-After"))
	}
}
