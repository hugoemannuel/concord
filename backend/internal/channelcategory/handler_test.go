package channelcategory

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
	"github.com/gin-gonic/gin"
)

type fakePermissions struct{ snap *permission.Snapshot }

func (p fakePermissions) Snapshot(context.Context, string) (*permission.Snapshot, error) {
	return p.snap, nil
}

type fakeStore struct {
	creates           int
	saves             int
	saveResult        SaveResult
	saveErr           error
	lastWrite         LayoutWrite
	lastViewer        Viewer
	synced            int
	syncErr           error
	updates, deletes  int
	lastOverwrites    []permission.Overwrite
	currentOverwrites []permission.Overwrite
	layout            *Layout
}

func (s *fakeStore) SaveLayout(_ context.Context, _ string, write LayoutWrite, viewer Viewer) (SaveResult, error) {
	s.saves++
	s.lastWrite, s.lastViewer = write, viewer
	return s.saveResult, s.saveErr
}

func (s *fakeStore) List(context.Context, string) (Layout, error) {
	if s.layout != nil {
		return *s.layout, nil
	}
	return Layout{Categories: []Category{}, Channels: []Placement{{ChannelID: "publico"}, {ChannelID: "privado"}}}, nil
}
func (s *fakeStore) Create(_ context.Context, _, name string, overwrites []permission.Overwrite) (Category, error) {
	s.creates++
	s.lastOverwrites = overwrites
	return Category{ID: "nova", Name: name, Overwrites: overwrites}, nil
}
func (s *fakeStore) Update(_ context.Context, _, id string, update CategoryUpdate) (CategoryChange, error) {
	s.updates++
	before := Category{ID: id, Name: "antigo", Overwrites: s.currentOverwrites}
	after := before
	if update.Name != "" {
		after.Name = update.Name
	}
	if update.Overwrites != nil {
		next, err := update.Overwrites(s.currentOverwrites)
		if err != nil {
			return CategoryChange{}, err
		}
		after.Overwrites, s.lastOverwrites = next, next
	}
	return CategoryChange{Before: before, After: after}, nil
}
func (s *fakeStore) Delete(_ context.Context, _, id string) (Category, error) {
	s.deletes++
	return Category{ID: id, Name: "apagada"}, nil
}
func (s *fakeStore) MoveCategory(context.Context, string, string, string) error          { return nil }
func (s *fakeStore) MoveChannel(context.Context, string, string, *string, *string) error { return nil }
func (s *fakeStore) SyncChannel(context.Context, string, string) (Category, error) {
	s.synced++
	return Category{ID: "cat", Name: "Jogos"}, s.syncErr
}

func TestCategoryRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	snap := permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).WithMember("dono").WithMember("ana").WithChannel("publico", "text").WithChannel("privado", "text", permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel}).WithCategory("categoria")
	store := &fakeStore{}
	router := gin.New()
	user := "ana"
	Routes(router.Group("/api"), NewHandler(store, fakePermissions{snap}, nil), func(c *gin.Context) { c.Set("userID", user); c.Next() })
	request := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/servers/s1/categories"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	t.Run("filtra canais privados", func(t *testing.T) {
		w := request(http.MethodGet, "", "")
		if w.Code != 200 || strings.Contains(w.Body.String(), "privado") || !strings.Contains(w.Body.String(), "publico") {
			t.Fatalf("resposta: %d %s", w.Code, w.Body.String())
		}
	})
	t.Run("exige permissão para criar", func(t *testing.T) {
		w := request(http.MethodPost, "", `{"name":"Jogos"}`)
		if w.Code != 403 || store.creates != 0 {
			t.Fatalf("status %d, criações %d", w.Code, store.creates)
		}
	})
	t.Run("valida nome", func(t *testing.T) {
		user = "dono"
		w := request(http.MethodPost, "", `{"name":"   "}`)
		if w.Code != 400 || store.creates != 0 {
			t.Fatalf("status %d, criações %d", w.Code, store.creates)
		}
	})
	t.Run("permite ao dono criar", func(t *testing.T) {
		w := request(http.MethodPost, "", `{"name":"Jogos"}`)
		if w.Code != 204 || store.creates != 1 {
			t.Fatalf("status %d, criações %d", w.Code, store.creates)
		}
	})
	t.Run("valida movimentação", func(t *testing.T) {
		for _, tc := range []struct {
			path, body string
			status     int
		}{
			{"/categoria/order", `{"direction":"up"}`, 204},
			{"/categoria/order", `{"direction":"down"}`, 204},
			{"/categoria/order", `{"direction":"lado"}`, 400},
			{"/channels/publico", `{"category_id":null}`, 204},
			{"/channels/inexistente", `{"category_id":null}`, 404},
			{"/channels/publico", `{"before_id":"inexistente"}`, 404},
			{"/channels/publico", `{`, 400},
		} {
			w := request(http.MethodPut, tc.path, tc.body)
			if w.Code != tc.status {
				t.Errorf("%s %s: status %d, esperado %d", tc.path, tc.body, w.Code, tc.status)
			}
		}
	})
}

type fakeAudit struct{ events []audit.Event }

func (a *fakeAudit) Record(_ context.Context, e audit.Event) { a.events = append(a.events, e) }

type fakePublisher struct{ servers, permissions []string }

func (p *fakePublisher) PublishCategoryChanged(server string) { p.servers = append(p.servers, server) }
func (p *fakePublisher) PublishPermissionsChanged(server string) {
	p.permissions = append(p.permissions, server)
}

func TestSaveLayoutRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	body := `{"revision":"r1","categories":["a"],"channels":[{"channel_id":"publico","category_id":"a","position":0}]}`
	everyone := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel}
	setup := func(store *fakeStore, user string) (func(string) *httptest.ResponseRecorder, *fakeAudit, *fakePublisher) {
		snap := permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).WithMember("dono").WithMember("ana").WithChannel("publico", "text").WithChannel("privado", "text", everyone)
		recorder, publisher := &fakeAudit{}, &fakePublisher{}
		handler := NewHandler(store, fakePermissions{snap}, publisher)
		handler.SetAudit(recorder)
		router := gin.New()
		Routes(router.Group("/api"), handler, func(c *gin.Context) { c.Set("userID", user); c.Next() })
		return func(payload string) *httptest.ResponseRecorder {
			r := httptest.NewRequest(http.MethodPut, "/api/servers/s1/categories/layout", strings.NewReader(payload))
			r.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, r)
			return w
		}, recorder, publisher
	}
	t.Run("sem gerenciar canais não grava", func(t *testing.T) {
		store := &fakeStore{}
		put, recorder, publisher := setup(store, "ana")
		if w := put(body); w.Code != http.StatusForbidden {
			t.Fatalf("status %d", w.Code)
		}
		if store.saves != 0 || len(recorder.events) != 0 || len(publisher.servers) != 0 {
			t.Fatalf("efeitos: gravações=%d auditoria=%v eventos=%v", store.saves, recorder.events, publisher.servers)
		}
	})
	t.Run("grava, avisa o servidor e registra na auditoria", func(t *testing.T) {
		store := &fakeStore{saveResult: SaveResult{Revision: "r2", Changed: true}}
		put, recorder, publisher := setup(store, "dono")
		w := put(body)
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"revision":"r2"`) {
			t.Fatalf("resposta: %d %s", w.Code, w.Body.String())
		}
		if store.lastWrite.Revision != "r1" || store.lastWrite.Categories[0] != "a" || *store.lastWrite.Channels[0].CategoryID != "a" {
			t.Fatalf("pedido: %+v", store.lastWrite)
		}
		if !store.lastViewer.Channel("publico") {
			t.Fatal("o viewer recusou um canal visível")
		}
		if len(publisher.servers) != 1 || publisher.servers[0] != "s1" {
			t.Fatalf("eventos: %v", publisher.servers)
		}
		if len(recorder.events) != 1 {
			t.Fatalf("auditoria: %v", recorder.events)
		}
		e := recorder.events[0]
		if e.Action != audit.ChannelReorder || e.ServerID != "s1" || e.ActorID != "dono" || e.Changes[0].After != "layout" {
			t.Fatalf("auditoria: %+v", e)
		}
	})
	t.Run("sem mudança não avisa nem registra", func(t *testing.T) {
		store := &fakeStore{saveResult: SaveResult{Revision: "r1"}}
		put, recorder, publisher := setup(store, "dono")
		if w := put(body); w.Code != http.StatusOK {
			t.Fatalf("status %d", w.Code)
		}
		if len(recorder.events) != 0 || len(publisher.servers) != 0 {
			t.Fatalf("efeitos: %v %v", recorder.events, publisher.servers)
		}
	})
	for _, tc := range []struct {
		name    string
		err     error
		payload string
		status  int
		code    string
	}{
		{"corpo inválido", nil, `{`, 400, ""},
		{"sem revisão", nil, `{"categories":[],"channels":[]}`, 400, ""},
		{"lista inválida", ErrInvalidLayout, body, 400, "invalid_layout"},
		{"lista mudou", ErrLayoutConflict, body, 409, "layout_conflict"},
		{"erro do banco", errors.New("falhou"), body, 500, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			put, recorder, publisher := setup(&fakeStore{saveErr: tc.err}, "dono")
			w := put(tc.payload)
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.code) {
				t.Fatalf("resposta: %d %s", w.Code, w.Body.String())
			}
			if len(recorder.events) != 0 || len(publisher.servers) != 0 {
				t.Fatalf("efeitos: %v %v", recorder.events, publisher.servers)
			}
		})
	}
	t.Run("a lista traz a revisão do que o membro vê", func(t *testing.T) {
		snap := permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).WithMember("dono").WithMember("ana").WithChannel("publico", "text").WithChannel("privado", "text", everyone)
		router := gin.New()
		Routes(router.Group("/api"), NewHandler(&fakeStore{}, fakePermissions{snap}, nil), func(c *gin.Context) { c.Set("userID", "ana"); c.Next() })
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/servers/s1/categories", nil))
		want := layoutRevision(Layout{Categories: []Category{}, Channels: []Placement{{ChannelID: "publico"}}})
		if !strings.Contains(w.Body.String(), `"revision":"`+want+`"`) {
			t.Fatalf("resposta: %s, quer revisão %s", w.Body.String(), want)
		}
	})
}
