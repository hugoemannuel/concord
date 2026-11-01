package savedprofile

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

type fakeMedia struct{ removed []string }

func (m *fakeMedia) RemoveMediaURL(url *string) {
	if url != nil {
		m.removed = append(m.removed, *url)
	}
}

// fakeNotifier guarda os avisos "sua lista de perfis salvos mudou".
type fakeNotifier struct {
	users  []string
	events []string
}

func (n *fakeNotifier) SendToUser(userID string, event []byte) {
	n.users = append(n.users, userID)
	var ev struct {
		Type string `json:"type"`
	}
	json.Unmarshal(event, &ev)
	n.events = append(n.events, ev.Type)
}

type handlerEnv struct {
	router   *gin.Engine
	store    *fakeStore
	profiles *fakeProfiles
	media    *fakeMedia
	notify   *fakeNotifier
}

func newHandlerEnv() *handlerEnv {
	gin.SetMode(gin.TestMode)
	service, store, profiles := newTestService()
	media, notify := &fakeMedia{}, &fakeNotifier{}
	router := gin.New()
	fakeAuth := func(c *gin.Context) {
		c.Set("userID", meID)
		c.Next()
	}
	Routes(router.Group("/api"), NewHandler(service, media, notify), fakeAuth)
	return &handlerEnv{router: router, store: store, profiles: profiles, media: media, notify: notify}
}

func (e *handlerEnv) do(method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "/api/users/me/saved-profiles"+path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec
}

func (e *handlerEnv) create(t *testing.T, name string) SavedProfile {
	t.Helper()
	rec := e.do(http.MethodPost, "", `{"name":"`+name+`"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("criar: status = %d: %s", rec.Code, rec.Body.String())
	}
	var sp SavedProfile
	json.Unmarshal(rec.Body.Bytes(), &sp)
	return sp
}

func TestHandlerCreateListRename(t *testing.T) {
	e := newHandlerEnv()
	sp := e.create(t, "Gamer")
	if sp.Name != "Gamer" || sp.AvatarURL == nil || sp.Fields.DisplayName != "Mugis" {
		t.Fatalf("criado = %+v", sp)
	}

	rec := e.do(http.MethodGet, "", "")
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != http.StatusOK || len(list) != 1 || list[0]["avatar_url"] != avatarA || list[0]["fields"] == nil {
		t.Fatalf("lista = %d %s", rec.Code, rec.Body.String())
	}

	rec = e.do(http.MethodPatch, "/"+sp.ID, `{"name":"Trabalho"}`)
	if rec.Code != http.StatusOK || !bytes.Contains(rec.Body.Bytes(), []byte(`"Trabalho"`)) {
		t.Fatalf("renomear = %d %s", rec.Code, rec.Body.String())
	}
}

func TestHandlerErrors(t *testing.T) {
	e := newHandlerEnv()
	sp := e.create(t, "A")
	cases := []struct {
		name, method, path, body string
		want                     int
	}{
		{"corpo inválido", http.MethodPost, "", `{`, http.StatusBadRequest},
		{"nome vazio", http.MethodPost, "", `{"name":" "}`, http.StatusBadRequest},
		{"nome repetido", http.MethodPost, "", `{"name":"a"}`, http.StatusConflict},
		{"id torto", http.MethodPost, "/x/apply", ``, http.StatusNotFound},
		{"não existe", http.MethodDelete, "/99999999-9999-4999-8999-999999999999", ``, http.StatusNotFound},
		{"renomear sem corpo", http.MethodPatch, "/" + sp.ID, `{`, http.StatusBadRequest},
		{"renomear id torto", http.MethodPatch, "/x", `{"name":"b"}`, http.StatusNotFound},
		{"excluir id torto", http.MethodDelete, "/x", ``, http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if rec := e.do(tc.method, tc.path, tc.body); rec.Code != tc.want {
				t.Fatalf("status = %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

func TestHandlerLimit(t *testing.T) {
	e := newHandlerEnv()
	for i := range MaxPerUser {
		e.create(t, "p"+string(rune('a'+i)))
	}
	if rec := e.do(http.MethodPost, "", `{"name":"mais um"}`); rec.Code != http.StatusConflict {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestHandlerApplyRemovesReplacedMedia(t *testing.T) {
	e := newHandlerEnv()
	sp := e.create(t, "A")
	b := avatarB
	e.profiles.me.AvatarURL = &b

	rec := e.do(http.MethodPost, "/"+sp.ID+"/apply", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(avatarA)) {
		t.Fatalf("resposta sem o avatar aplicado: %s", rec.Body.String())
	}
	if len(e.media.removed) != 1 || e.media.removed[0] != avatarB {
		t.Fatalf("removidas = %v", e.media.removed)
	}
}

func TestHandlerDeleteReleasesMedia(t *testing.T) {
	e := newHandlerEnv()
	sp := e.create(t, "A")
	if rec := e.do(http.MethodDelete, "/"+sp.ID, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
	if len(e.media.removed) != 1 || e.media.removed[0] != avatarA {
		t.Fatalf("removidas = %v", e.media.removed)
	}
	if len(e.store.items) != 0 {
		t.Fatal("deveria apagar")
	}
}

type failingStore struct{ *fakeStore }

func (failingStore) List(context.Context, string) ([]SavedProfile, error) {
	return nil, errors.New("banco fora")
}

func TestHandlerUnexpectedError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	profiles := newFakeProfiles()
	router := gin.New()
	Routes(router.Group("/api"), NewHandler(NewService(failingStore{newFakeStore()}, profiles, profiles), &fakeMedia{}, &fakeNotifier{}), func(c *gin.Context) { c.Set("userID", meID) })
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/users/me/saved-profiles", nil))
	if rec.Code != http.StatusInternalServerError || bytes.Contains(rec.Body.Bytes(), []byte("banco")) {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
}

func TestHandlerOverwriteKeepsNameAndReleasesOldMedia(t *testing.T) {
	e := newHandlerEnv()
	sp := e.create(t, "Gamer")
	b := avatarB
	e.profiles.me.AvatarURL = &b
	e.profiles.me.DisplayName = "Outro"

	rec := e.do(http.MethodPut, "/"+sp.ID, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	var got SavedProfile
	json.Unmarshal(rec.Body.Bytes(), &got)
	if got.ID != sp.ID || got.Name != "Gamer" || got.Fields.DisplayName != "Outro" || got.AvatarURL == nil || *got.AvatarURL != avatarB {
		t.Fatalf("atualizado = %+v", got)
	}
	// O avatar antigo (só do perfil salvo) é solto; o novo continua por referência.
	if len(e.media.removed) != 1 || e.media.removed[0] != avatarA {
		t.Fatalf("removidas = %v", e.media.removed)
	}
}

func TestHandlerOverwriteErrors(t *testing.T) {
	e := newHandlerEnv()
	for _, id := range []string{"/x", "/99999999-9999-4999-8999-999999999999"} {
		if rec := e.do(http.MethodPut, id, ""); rec.Code != http.StatusNotFound {
			t.Fatalf("PUT %s: status = %d", id, rec.Code)
		}
	}
	if len(e.notify.events) != 0 {
		t.Fatalf("erro não avisa os aparelhos: %v", e.notify.events)
	}
}

func TestHandlerNotifiesUserDevicesOnEveryChange(t *testing.T) {
	e := newHandlerEnv()
	sp := e.create(t, "A")
	e.do(http.MethodPatch, "/"+sp.ID, `{"name":"B"}`)
	e.do(http.MethodPut, "/"+sp.ID, "")
	e.do(http.MethodPost, "/"+sp.ID+"/apply", "")
	e.do(http.MethodDelete, "/"+sp.ID, "")
	if len(e.notify.events) != 5 {
		t.Fatalf("avisos = %v", e.notify.events)
	}
	for i, typ := range e.notify.events {
		if typ != "saved_profiles:changed" || e.notify.users[i] != meID {
			t.Fatalf("aviso %d = %s para %s", i, typ, e.notify.users[i])
		}
	}
}

func TestHandlerDoesNotNotifyOnFailure(t *testing.T) {
	e := newHandlerEnv()
	e.create(t, "A")
	before := len(e.notify.events)
	e.do(http.MethodPost, "", `{"name":"a"}`) // nome repetido
	e.do(http.MethodPatch, "/99999999-9999-4999-8999-999999999999", `{"name":"b"}`)
	if len(e.notify.events) != before {
		t.Fatalf("avisos = %v", e.notify.events)
	}
}
