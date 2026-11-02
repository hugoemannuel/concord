package plugin

import (
	"context"
	"errors"
	"reflect"
	"sort"
	"testing"

	"gin-quickstart/backend/internal/permission"
)

type fakeStore struct {
	plugin     Plugin
	servers    []string
	serversErr error
	calls      int
	includeAll bool
	created    bool
}

func (f *fakeStore) Create(_ context.Context, _ string, _ Draft) (Plugin, error) {
	f.calls++
	f.created = true
	return f.plugin, nil
}
func (f *fakeStore) Get(_ context.Context, _ string) (Plugin, error) {
	f.calls++
	return f.plugin, nil
}
func (f *fakeStore) List(_ context.Context, includeAll bool) ([]Plugin, error) {
	f.calls++
	f.includeAll = includeAll
	return nil, nil
}
func (f *fakeStore) SetReview(_ context.Context, _ string, st Status, _ *string, _ string) (Plugin, error) {
	f.calls++
	f.plugin.Status = st
	return f.plugin, nil
}
func (f *fakeStore) Install(context.Context, string, string, string) error { f.calls++; return nil }
func (f *fakeStore) Uninstall(context.Context, string, string) error       { f.calls++; return nil }
func (f *fakeStore) ListServer(context.Context, string, string) ([]ServerPlugin, error) {
	f.calls++
	return nil, nil
}
func (f *fakeStore) SetEnabled(context.Context, string, string, string, bool) error {
	f.calls++
	return nil
}
func (f *fakeStore) ServersWith(context.Context, string) ([]string, error) {
	return f.servers, f.serversErr
}

type fakePerms struct {
	err  error
	want *int64
}

func (f fakePerms) Require(_ context.Context, _, _ string, want int64) error {
	if f.want != nil {
		*f.want = want
	}
	return f.err
}
func (f fakePerms) ServerPerms(context.Context, string, string) (int64, error) {
	return 0, f.err
}

type fakePub struct{ rooms map[string][]byte }

func (p *fakePub) BroadcastToRoom(room string, ev []byte) {
	if p.rooms == nil {
		p.rooms = map[string][]byte{}
	}
	p.rooms[room] = ev
}

func (p *fakePub) names() []string {
	var n []string
	for k := range p.rooms {
		n = append(n, k)
	}
	sort.Strings(n)
	return n
}

func newSvc(st *fakeStore, perr error) (*Service, *fakePub) {
	pub := &fakePub{}
	return NewService(st, fakePerms{err: perr}, pub, []string{"tech"}), pub
}

func TestReviewOnlyTech(t *testing.T) {
	st := &fakeStore{}
	svc, _ := newSvc(st, nil)
	if _, err := svc.Review(context.Background(), "u1", "p1", StatusApproved, nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("esperava ErrForbidden, veio %v", err)
	}
	if st.calls != 0 {
		t.Fatal("store não deveria ser chamado")
	}
}

func TestReviewInvalidTransition(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusApproved}}
	svc, _ := newSvc(st, nil)
	if _, err := svc.Review(context.Background(), "tech", "p1", StatusApproved, nil); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("esperava ErrInvalidTransition, veio %v", err)
	}
}

func TestReviewBroadcastsToInstalledServers(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusPending}, servers: []string{"s1", "s2"}}
	svc, pub := newSvc(st, nil)
	if _, err := svc.Review(context.Background(), "tech", "p1", StatusApproved, nil); err != nil {
		t.Fatal(err)
	}
	if got := pub.names(); !reflect.DeepEqual(got, []string{"server:s1", "server:s2"}) {
		t.Fatalf("salas: %v", got)
	}
	want := `{"payload":{"server_id":"s1"},"type":"plugins:changed"}`
	if string(pub.rooms["server:s1"]) != want {
		t.Fatalf("evento: %s", pub.rooms["server:s1"])
	}
}

func TestInstallRequiresManageServer(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusApproved}}
	svc, _ := newSvc(st, permission.ErrMissingPermission)
	if err := svc.Install(context.Background(), "s1", "u1", "p1"); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("veio %v", err)
	}
}

func TestInstallRejectsNotApproved(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusPending}}
	svc, _ := newSvc(st, nil)
	if err := svc.Install(context.Background(), "s1", "u1", "p1"); !errors.Is(err, ErrNotApproved) {
		t.Fatalf("veio %v", err)
	}
}

func TestReviewSavedWhenListingServersFails(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusPending}, serversErr: errors.New("db fora")}
	svc, pub := newSvc(st, nil)
	p, err := svc.Review(context.Background(), "tech", "p1", StatusApproved, nil)
	if err != nil || p.Status != StatusApproved {
		t.Fatalf("p=%v err=%v", p, err)
	}
	if len(pub.names()) != 0 {
		t.Fatalf("não deveria transmitir: %v", pub.names())
	}
}

func TestInstallAndUninstallBroadcast(t *testing.T) {
	var want int64
	st := &fakeStore{plugin: Plugin{Status: StatusApproved}}
	pub := &fakePub{}
	svc := NewService(st, fakePerms{want: &want}, pub, nil)
	if err := svc.Install(context.Background(), "s1", "u1", "p1"); err != nil {
		t.Fatal(err)
	}
	if want != permission.ManageServer {
		t.Fatalf("install exigiu %d", want)
	}
	if !reflect.DeepEqual(pub.names(), []string{"server:s1"}) {
		t.Fatalf("install: %v", pub.names())
	}
	want = 0
	pub.rooms = nil
	if err := svc.Uninstall(context.Background(), "s1", "u1", "p1"); err != nil {
		t.Fatal(err)
	}
	if want != permission.ManageServer {
		t.Fatalf("uninstall exigiu %d", want)
	}
	if !reflect.DeepEqual(pub.names(), []string{"server:s1"}) {
		t.Fatalf("uninstall: %v", pub.names())
	}
}

func TestServerPluginsNonMember(t *testing.T) {
	svc, _ := newSvc(&fakeStore{}, permission.ErrNotMember)
	if _, err := svc.ServerPlugins(context.Background(), "s1", "u1"); !errors.Is(err, permission.ErrNotMember) {
		t.Fatalf("veio %v", err)
	}
}

func TestServerPluginsNeverNil(t *testing.T) {
	svc, _ := newSvc(&fakeStore{}, nil)
	got, err := svc.ServerPlugins(context.Background(), "s1", "u1")
	if err != nil || got == nil {
		t.Fatalf("got=%v err=%v", got, err)
	}
}

func TestSetEnabledBroadcastsToUserOnly(t *testing.T) {
	svc, pub := newSvc(&fakeStore{}, nil)
	if err := svc.SetEnabled(context.Background(), "s1", "u1", "p1", true); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(pub.names(), []string{"user:u1"}) {
		t.Fatalf("salas: %v", pub.names())
	}
}

func TestCatalogTechSeesAll(t *testing.T) {
	st := &fakeStore{}
	svc, _ := newSvc(st, nil)
	got, err := svc.Catalog(context.Background(), "tech")
	if err != nil || got == nil || !st.includeAll {
		t.Fatalf("tech: got=%v err=%v includeAll=%v", got, err, st.includeAll)
	}
	if _, err := svc.Catalog(context.Background(), "u1"); err != nil || st.includeAll {
		t.Fatalf("outros: err=%v includeAll=%v", err, st.includeAll)
	}
}

func TestCreateValidates(t *testing.T) {
	st := &fakeStore{}
	svc, _ := newSvc(st, nil)
	_, err := svc.Create(context.Background(), "u1", Draft{Name: "a", Description: "b", PanelURL: "http://x.com"})
	if !errors.Is(err, ErrInvalidURL) || st.calls != 0 {
		t.Fatalf("err=%v calls=%d", err, st.calls)
	}
}
