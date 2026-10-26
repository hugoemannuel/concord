package channel

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// fakeStore guarda os canais em memória, na ordem de cada tipo.
type fakeStore struct {
	ownerID  string
	admins   map[string]bool
	members  map[string]bool
	serverID string
	order    map[string][]string // tipo -> ids na ordem
	calls    int
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		ownerID:  "dono",
		admins:   map[string]bool{"mod": true},
		members:  map[string]bool{"dono": true, "mod": true, "ana": true},
		serverID: "s1",
		order: map[string][]string{
			TypeText:  {"t1", "t2", "t3"},
			TypeVoice: {"v1", "v2"},
		},
	}
}

func (f *fakeStore) Create(context.Context, *Channel, []permission.Overwrite) error { return nil }
func (f *fakeStore) FindByID(context.Context, string) (*Channel, error) {
	return nil, ErrChannelNotFound
}
func (f *fakeStore) FindSystemByServerID(context.Context, string) (*Channel, error) {
	return nil, ErrChannelNotFound
}
func (f *fakeStore) FindNoticesByServerID(context.Context, string) (*Channel, error) {
	return nil, ErrChannelNotFound
}
func (f *fakeStore) Update(context.Context, string, string) error { return nil }
func (f *fakeStore) Delete(context.Context, string) error         { return nil }
func (f *fakeStore) ListByServerID(context.Context, string) ([]Channel, error) {
	return []Channel{}, nil
}

func (f *fakeStore) SetOverwrite(context.Context, string, permission.Overwrite) error { return nil }
func (f *fakeStore) DeleteOverwrite(context.Context, string, string, string) error    { return nil }

// perms: dono, "mod" com o cargo Moderador e "ana" só com @everyone.
func (f *fakeStore) perms() *permission.Service {
	snap := permission.NewSnapshot(f.serverID, f.ownerID, permission.DefaultEveryone).
		WithRole("moderador", 1, permission.DefaultModerator)
	for id := range f.members {
		if f.admins[id] {
			snap.WithMember(id, "moderador")
		} else {
			snap.WithMember(id)
		}
	}
	return permission.NewService(&permission.StaticStore{Snapshots: map[string]*permission.Snapshot{f.serverID: snap}})
}

func (f *fakeStore) Reorder(_ context.Context, serverID, chType string, ids []string) error {
	f.calls++
	var current []string
	if serverID == f.serverID {
		current = f.order[chType]
	}
	if err := ValidateOrder(current, ids); err != nil {
		return err
	}
	f.order[chType] = append([]string(nil), ids...)
	return nil
}

type fakePublisher struct {
	reorders []ReorderEvent
}

func (p *fakePublisher) PublishChannelCreate(CreateEvent)     {}
func (p *fakePublisher) PublishChannelUpdate(CreateEvent)     {}
func (p *fakePublisher) PublishChannelDelete(DeleteEvent)     {}
func (p *fakePublisher) PublishChannelReorder(e ReorderEvent) { p.reorders = append(p.reorders, e) }
func (p *fakePublisher) PublishPermissionsChanged(string)     {}

func reorderRequest(t *testing.T, store *fakeStore, pub *fakePublisher, userID, serverID, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	auth := func(c *gin.Context) {
		if userID != "" {
			c.Set("userID", userID)
		}
		c.Next()
	}
	ChannelRoutes(router.Group("/api"), ChannelHandler(newService(store, pub), store.perms()), auth)

	req := httptest.NewRequest(http.MethodPut, "/api/servers/"+serverID+"/channels/order", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestReorderByOwnerAndModerator(t *testing.T) {
	for _, user := range []string{"dono", "mod"} {
		store, pub := newFakeStore(), &fakePublisher{}
		rec := reorderRequest(t, store, pub, user, "s1", `{"type":"text","channel_ids":["t3","t1","t2"]}`)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: status = %d (%s), want 200", user, rec.Code, rec.Body.String())
		}
		if want := []string{"t3", "t1", "t2"}; !reflect.DeepEqual(store.order[TypeText], want) {
			t.Fatalf("%s: order = %v, want %v", user, store.order[TypeText], want)
		}
		if !reflect.DeepEqual(store.order[TypeVoice], []string{"v1", "v2"}) {
			t.Fatalf("%s: voice order changed: %v", user, store.order[TypeVoice])
		}
		want := []ReorderEvent{{ServerID: "s1", Type: TypeText, ChannelIDs: []string{"t3", "t1", "t2"}}}
		if !reflect.DeepEqual(pub.reorders, want) {
			t.Fatalf("%s: events = %+v, want %+v", user, pub.reorders, want)
		}
	}
}

func TestReorderRequiresChannelPermission(t *testing.T) {
	cases := map[string]struct {
		user   string
		status int
	}{
		"membro comum":   {"ana", http.StatusForbidden},
		"não é membro":   {"zeca", http.StatusForbidden},
		"sem autenticar": {"", http.StatusUnauthorized},
	}
	for name, tc := range cases {
		store, pub := newFakeStore(), &fakePublisher{}
		rec := reorderRequest(t, store, pub, tc.user, "s1", `{"type":"text","channel_ids":["t3","t1","t2"]}`)
		if rec.Code != tc.status {
			t.Fatalf("%s: status = %d, want %d", name, rec.Code, tc.status)
		}
		if store.calls != 0 || len(pub.reorders) != 0 {
			t.Fatalf("%s: reordered without permission", name)
		}
	}
}

func TestReorderValidatesIDsAndType(t *testing.T) {
	cases := map[string]string{
		"tipo inválido":         `{"type":"video","channel_ids":["t1","t2","t3"]}`,
		"sem tipo":              `{"channel_ids":["t1","t2","t3"]}`,
		"faltando canal":        `{"type":"text","channel_ids":["t1","t2"]}`,
		"canal de voz no texto": `{"type":"text","channel_ids":["t1","t2","t3","v1"]}`,
		"texto no lugar de voz": `{"type":"voice","channel_ids":["v1","t1"]}`,
		"repetido":              `{"type":"text","channel_ids":["t1","t1","t2"]}`,
		"json quebrado":         `{"type":`,
		"request_id enorme":     `{"type":"text","channel_ids":["t3","t1","t2"],"request_id":"` + strings.Repeat("x", 65) + `"}`,
	}
	for name, body := range cases {
		store, pub := newFakeStore(), &fakePublisher{}
		rec := reorderRequest(t, store, pub, "dono", "s1", body)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: status = %d (%s), want 400", name, rec.Code, rec.Body.String())
		}
		if len(pub.reorders) != 0 {
			t.Fatalf("%s: published an invalid order", name)
		}
		if !reflect.DeepEqual(store.order[TypeText], []string{"t1", "t2", "t3"}) {
			t.Fatalf("%s: text order changed: %v", name, store.order[TypeText])
		}
	}
}

func TestReorderOtherServerChannels(t *testing.T) {
	// Moderador de s1 mandando ids de s1 para outro servidor: sem permissão lá.
	store, pub := newFakeStore(), &fakePublisher{}
	rec := reorderRequest(t, store, pub, "mod", "s2", `{"type":"text","channel_ids":["t1","t2","t3"]}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}

func TestReorderEchoesRequestID(t *testing.T) {
	store, pub := newFakeStore(), &fakePublisher{}
	rec := reorderRequest(t, store, pub, "mod", "s1", `{"type":"voice","channel_ids":["v2","v1"],"request_id":"req-123"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body.String())
	}
	want := []ReorderEvent{{ServerID: "s1", Type: TypeVoice, ChannelIDs: []string{"v2", "v1"}, RequestID: "req-123"}}
	if !reflect.DeepEqual(pub.reorders, want) {
		t.Fatalf("events = %+v, want %+v", pub.reorders, want)
	}
}

func TestReorderResponseHasOrder(t *testing.T) {
	store, pub := newFakeStore(), &fakePublisher{}
	rec := reorderRequest(t, store, pub, "dono", "s1", `{"type":"voice","channel_ids":["v2","v1"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var got struct {
		Type       string   `json:"type"`
		ChannelIDs []string `json:"channel_ids"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Type != TypeVoice || !reflect.DeepEqual(got.ChannelIDs, []string{"v2", "v1"}) {
		t.Fatalf("body = %+v", got)
	}
}
