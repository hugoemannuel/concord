package channelcategory

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

type routeScene struct {
	store     *fakeStore
	audit     *fakeAudit
	publisher *fakePublisher
	cache     *fakeCache
	request   func(user, method, path, body string) *httptest.ResponseRecorder
}

type fakeCache struct{ calls int }

func (c *fakeCache) InvalidateServer(string) { c.calls++ }

func routeSnapshot() *permission.Snapshot {
	closed := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel}
	vip := permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: accessBits}
	return permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).
		WithRole("vip", 1, 0).
		WithRole("canais", 2, permission.ManageChannels).
		WithRole("gerente", 3, permission.DefaultEveryone|permission.ManageChannels|permission.ManageRoles).
		WithMember("dono").WithMember("ana").WithMember("bia", "vip").WithMember("cris", "canais").WithMember("gi", "gerente").
		WithCategory("aberta").
		WithCategory("secreta", closed, vip).
		WithChannel("publico", "text").
		WithChannel("vinculado", "text", closed, vip).
		WithChannel("proprio", "text", permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Deny: permission.SendMessages}).
		InCategory("vinculado", "secreta").
		InCategory("proprio", "aberta")
}

func newRouteScene() *routeScene {
	gin.SetMode(gin.TestMode)
	scene := &routeScene{store: &fakeStore{}, audit: &fakeAudit{}, publisher: &fakePublisher{}, cache: &fakeCache{}}
	handler := NewHandler(scene.store, fakePermissions{routeSnapshot()}, scene.publisher)
	handler.SetAudit(scene.audit)
	handler.SetPermissionCache(scene.cache)
	var acting string
	router := gin.New()
	Routes(router.Group("/api"), handler, func(c *gin.Context) { c.Set("userID", acting); c.Next() })
	scene.request = func(user, method, path, body string) *httptest.ResponseRecorder {
		acting = user
		r := httptest.NewRequest(method, "/api/servers/s1/categories"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	return scene
}

func (s *routeScene) lastAudit(t *testing.T) audit.Event {
	t.Helper()
	if len(s.audit.events) == 0 {
		t.Fatal("nada na auditoria")
	}
	return s.audit.events[len(s.audit.events)-1]
}

func TestListShowsPermissionsOnlyToWhoSees(t *testing.T) {
	scene := newRouteScene()
	scene.store.layout = &Layout{
		Categories: []Category{{ID: "aberta", Name: "Aberta"}, {ID: "secreta", Name: "Secreta"}},
		Channels: []Placement{
			{ChannelID: "publico"},
			{ChannelID: "vinculado", CategoryID: cat("secreta")},
			{ChannelID: "proprio", CategoryID: cat("aberta")},
		},
	}
	w := scene.request("ana", http.MethodGet, "", "")
	if strings.Contains(w.Body.String(), "ecreta") || strings.Contains(w.Body.String(), "vinculado") {
		t.Fatalf("vazou: %s", w.Body.String())
	}
	w = scene.request("bia", http.MethodGet, "", "")
	var layout Layout
	if err := json.Unmarshal(w.Body.Bytes(), &layout); err != nil {
		t.Fatal(err)
	}
	if len(layout.Categories) != 2 || len(layout.Categories[1].Overwrites) != 2 {
		t.Fatalf("categorias: %+v", layout.Categories)
	}
	synced := map[string]bool{}
	for _, placement := range layout.Channels {
		synced[placement.ChannelID] = placement.Synced
	}
	if !synced["vinculado"] || synced["proprio"] || synced["publico"] {
		t.Fatalf("vinculados: %v", synced)
	}
}

func TestCreatePrivateCategory(t *testing.T) {
	scene := newRouteScene()
	w := scene.request("dono", http.MethodPost, "", `{"name":" Jogos ","private":true,"role_ids":["vip"],"member_ids":["ana"]}`)
	if w.Code != 204 {
		t.Fatalf("status %d", w.Code)
	}
	if len(scene.store.lastOverwrites) != 3 {
		t.Fatalf("regras: %+v", scene.store.lastOverwrites)
	}
	event := scene.lastAudit(t)
	if event.Action != audit.CategoryCreate || event.TargetType != audit.TargetCategory || event.TargetName != "Jogos" {
		t.Fatalf("auditoria: %+v", event)
	}
	if len(event.Changes) != 2 || event.Changes[1].Field != "private" {
		t.Fatalf("mudanças: %+v", event.Changes)
	}
	if scene.cache.calls != 1 || len(scene.publisher.servers) != 1 {
		t.Fatalf("cache %d, eventos %v", scene.cache.calls, scene.publisher.servers)
	}
	for _, body := range []string{
		`{"name":"x","private":true,"role_ids":["de-fora"]}`,
		`{"name":"x","private":true,"member_ids":["de-fora"]}`,
		`{"name":"x","private":true,"role_ids":["everyone"]}`,
	} {
		if w := scene.request("dono", http.MethodPost, "", body); w.Code != 404 || !strings.Contains(w.Body.String(), "invalid_target") {
			t.Errorf("%s: %d %s", body, w.Code, w.Body.String())
		}
	}
}

func TestUpdateCategory(t *testing.T) {
	t.Run("renomear só precisa de gerenciar canais e não mexe em quem vê", func(t *testing.T) {
		scene := newRouteScene()
		if w := scene.request("cris", http.MethodPut, "/aberta", `{"name":"Nova"}`); w.Code != 204 {
			t.Fatalf("status %d", w.Code)
		}
		if scene.store.lastOverwrites != nil || len(scene.publisher.permissions) != 0 {
			t.Fatalf("mexeu nas permissões: %+v %v", scene.store.lastOverwrites, scene.publisher.permissions)
		}
		if event := scene.lastAudit(t); event.Action != audit.CategoryUpdate || event.Changes[0].Field != "name" {
			t.Fatalf("auditoria: %+v", event)
		}
	})
	t.Run("sem mudança não registra", func(t *testing.T) {
		scene := newRouteScene()
		if w := scene.request("cris", http.MethodPut, "/aberta", `{"name":"antigo"}`); w.Code != 204 {
			t.Fatalf("status %d", w.Code)
		}
		if len(scene.audit.events) != 0 {
			t.Fatalf("auditoria: %+v", scene.audit.events)
		}
	})
	t.Run("mudar quem vê exige também gerenciar cargos", func(t *testing.T) {
		scene := newRouteScene()
		if w := scene.request("cris", http.MethodPut, "/aberta", `{"name":"Nova","private":true}`); w.Code != 403 {
			t.Fatalf("status %d", w.Code)
		}
		if scene.store.updates != 0 {
			t.Fatal("gravou mesmo assim")
		}
	})
	t.Run("privada: grava, avisa quem perdeu e registra", func(t *testing.T) {
		scene := newRouteScene()
		if w := scene.request("gi", http.MethodPut, "/aberta", `{"name":"Nova","private":true,"role_ids":["vip"]}`); w.Code != 204 {
			t.Fatalf("status %d", w.Code)
		}
		if !isPrivate(scene.store.lastOverwrites, "everyone") {
			t.Fatalf("regras: %+v", scene.store.lastOverwrites)
		}
		if len(scene.publisher.permissions) != 1 {
			t.Fatalf("avisos: %v", scene.publisher.permissions)
		}
		fields := map[string]bool{}
		for _, change := range scene.lastAudit(t).Changes {
			fields[change.Field] = true
		}
		if !fields["private"] || !fields["overwrites"] {
			t.Fatalf("mudanças: %v", fields)
		}
	})
	t.Run("cargo de fora é recusado", func(t *testing.T) {
		scene := newRouteScene()
		if w := scene.request("gi", http.MethodPut, "/aberta", `{"name":"Nova","private":true,"role_ids":["de-fora"]}`); w.Code != 404 {
			t.Fatalf("status %d", w.Code)
		}
	})
	t.Run("nome inválido", func(t *testing.T) {
		scene := newRouteScene()
		for _, body := range []string{`{`, `{"name":"  "}`, `{"name":"` + strings.Repeat("x", 101) + `"}`} {
			if w := scene.request("dono", http.MethodPut, "/aberta", body); w.Code != 400 {
				t.Errorf("%s: status %d", body, w.Code)
			}
		}
	})
}

func TestDeleteCategoryRoute(t *testing.T) {
	scene := newRouteScene()
	if w := scene.request("ana", http.MethodDelete, "/aberta", ""); w.Code != 403 {
		t.Fatalf("status %d", w.Code)
	}
	if w := scene.request("cris", http.MethodDelete, "/secreta", ""); w.Code != 404 {
		t.Fatalf("categoria oculta: status %d", w.Code)
	}
	if w := scene.request("cris", http.MethodDelete, "/aberta", ""); w.Code != 204 {
		t.Fatalf("status %d", w.Code)
	}
	if scene.store.deletes != 1 || len(scene.publisher.permissions) != 1 {
		t.Fatalf("apagadas %d, avisos %v", scene.store.deletes, scene.publisher.permissions)
	}
	if event := scene.lastAudit(t); event.Action != audit.CategoryDelete || event.TargetName != "apagada" {
		t.Fatalf("auditoria: %+v", event)
	}
}

func TestCategoryOverwriteRoutes(t *testing.T) {
	put := func(scene *routeScene, user, path, body string) *httptest.ResponseRecorder {
		return scene.request(user, http.MethodPut, "/aberta/overwrites/"+path, body)
	}
	t.Run("grava e registra", func(t *testing.T) {
		scene := newRouteScene()
		if w := put(scene, "gi", "role/vip", `{"allow":1,"deny":256}`); w.Code != 204 {
			t.Fatalf("status %d: %s", w.Code, w.Body.String())
		}
		if len(scene.store.lastOverwrites) != 1 || scene.store.lastOverwrites[0].Deny != permission.SendMessages {
			t.Fatalf("regras: %+v", scene.store.lastOverwrites)
		}
		if len(scene.publisher.permissions) != 1 || scene.lastAudit(t).Action != audit.CategoryUpdate {
			t.Fatalf("avisos %v, auditoria %+v", scene.publisher.permissions, scene.audit.events)
		}
	})
	t.Run("apagar a regra", func(t *testing.T) {
		scene := newRouteScene()
		scene.store.currentOverwrites = []permission.Overwrite{{TargetType: permission.TargetRole, TargetID: "vip", Allow: permission.ViewChannel}}
		if w := scene.request("gi", http.MethodDelete, "/aberta/overwrites/role/vip", ""); w.Code != 204 {
			t.Fatalf("status %d", w.Code)
		}
		if len(scene.store.lastOverwrites) != 0 {
			t.Fatalf("regras: %+v", scene.store.lastOverwrites)
		}
	})
	for _, tc := range []struct {
		name, user, path, body string
		status                 int
		code                   string
	}{
		{"sem gerenciar cargos", "cris", "role/vip", `{"allow":1}`, 403, ""},
		{"sem gerenciar canais", "ana", "role/vip", `{"allow":1}`, 403, ""},
		{"alvo de fora", "gi", "role/de-fora", `{"allow":1}`, 404, "invalid_target"},
		{"tipo inválido", "gi", "canal/vip", `{"allow":1}`, 404, "invalid_target"},
		{"liberado e negado", "gi", "role/vip", `{"allow":1,"deny":1}`, 400, "invalid"},
		{"bit que não tem", "gi", "role/vip", `{"allow":128}`, 403, "cannot_grant"},
		{"corpo inválido", "gi", "role/vip", `{`, 400, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			scene := newRouteScene()
			w := put(scene, tc.user, tc.path, tc.body)
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.code) {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
			if scene.store.lastOverwrites != nil || len(scene.audit.events) != 0 {
				t.Fatalf("efeitos: %+v %+v", scene.store.lastOverwrites, scene.audit.events)
			}
		})
	}
}

func TestSyncChannelRoute(t *testing.T) {
	scene := newRouteScene()
	if w := scene.request("cris", http.MethodPost, "/channels/proprio/sync", ""); w.Code != 403 {
		t.Fatalf("sem gerenciar cargos: %d", w.Code)
	}
	if w := scene.request("gi", http.MethodPost, "/channels/inexistente/sync", ""); w.Code != 404 {
		t.Fatalf("canal inexistente: %d", w.Code)
	}
	if w := scene.request("gi", http.MethodPost, "/channels/vinculado/sync", ""); w.Code != 404 {
		t.Fatalf("canal oculto: %d", w.Code)
	}
	if w := scene.request("gi", http.MethodPost, "/channels/proprio/sync", ""); w.Code != 204 {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	if scene.store.synced != 1 || len(scene.publisher.permissions) != 1 {
		t.Fatalf("sincronizados %d, avisos %v", scene.store.synced, scene.publisher.permissions)
	}
	if event := scene.lastAudit(t); event.Action != audit.ChannelSync || event.TargetID != "proprio" || event.Changes[0].After != "Jogos" {
		t.Fatalf("auditoria: %+v", event)
	}
	scene.store.syncErr = ErrFixedChannel
	if w := scene.request("gi", http.MethodPost, "/channels/proprio/sync", ""); w.Code != 400 || !strings.Contains(w.Body.String(), "cannot_sync") {
		t.Fatalf("canal de sistema: %d %s", w.Code, w.Body.String())
	}
}

func TestMovesTellWhoLostAccessAndGoToAudit(t *testing.T) {
	scene := newRouteScene()
	if w := scene.request("cris", http.MethodPut, "/channels/publico", `{"category_id":"aberta"}`); w.Code != 204 {
		t.Fatalf("status %d", w.Code)
	}
	if len(scene.publisher.permissions) != 1 || scene.lastAudit(t).Action != audit.ChannelReorder {
		t.Fatalf("avisos %v, auditoria %+v", scene.publisher.permissions, scene.audit.events)
	}
	if w := scene.request("cris", http.MethodPut, "/channels/publico", `{"category_id":"secreta"}`); w.Code != 404 {
		t.Fatalf("destino oculto: %d", w.Code)
	}
	if w := scene.request("cris", http.MethodPut, "/aberta/order", `{"direction":"up"}`); w.Code != 204 {
		t.Fatalf("status %d", w.Code)
	}
}

func TestSaveLayoutWithMoveTellsWhoLostAccess(t *testing.T) {
	scene := newRouteScene()
	scene.store.saveResult = SaveResult{Revision: "r2", Changed: true, Moved: true}
	body := `{"revision":"r1","categories":["aberta"],"channels":[]}`
	if w := scene.request("cris", http.MethodPut, "/layout", body); w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
	if len(scene.publisher.permissions) != 1 || len(scene.publisher.servers) != 1 {
		t.Fatalf("avisos %v %v", scene.publisher.permissions, scene.publisher.servers)
	}
}

func TestRespondError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		err    error
		status int
	}{
		{pgx.ErrNoRows, 404},
		{ErrInvalidTarget, 404},
		{ErrInvalidOverwrite, 400},
		{ErrCannotGrant, 403},
		{ErrFixedChannel, 400},
		{ErrNoCategory, 400},
		{errors.New("falhou"), 500},
	} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		if !respondError(c, tc.err) || w.Code != tc.status {
			t.Errorf("%v: status %d, esperado %d", tc.err, w.Code, tc.status)
		}
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	if respondError(c, nil) {
		t.Error("sem erro não responde")
	}
}
