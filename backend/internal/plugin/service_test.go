package plugin

import (
	"context"
	"errors"
	"reflect"
	"sort"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"
)

type fakeStore struct {
	plugin      Plugin
	servers     []string
	serversErr  error
	calls       int
	includeAll  bool
	created     bool
	draft       Draft
	getErr      error
	uninstalled bool
}

func (f *fakeStore) Create(_ context.Context, _ string, d Draft) (Plugin, error) {
	f.draft = d
	f.calls++
	f.created = true
	return f.plugin, nil
}
func (f *fakeStore) Get(_ context.Context, _ string) (Plugin, error) {
	f.calls++
	return f.plugin, f.getErr
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
func (f *fakeStore) Uninstall(context.Context, string, string) error {
	f.calls++
	f.uninstalled = true
	return nil
}
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
	if _, err := svc.Review(context.Background(), "u1", "22222222-2222-4222-8222-222222222222", StatusApproved, nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("esperava ErrForbidden, veio %v", err)
	}
	if st.calls != 0 {
		t.Fatal("store não deveria ser chamado")
	}
}

func TestReviewInvalidTransition(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusApproved}}
	svc, _ := newSvc(st, nil)
	if _, err := svc.Review(context.Background(), "tech", "22222222-2222-4222-8222-222222222222", StatusApproved, nil); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("esperava ErrInvalidTransition, veio %v", err)
	}
}

func TestReviewBroadcastsToInstalledServers(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusPending}, servers: []string{"11111111-1111-4111-8111-111111111111", "s2"}}
	svc, pub := newSvc(st, nil)
	if _, err := svc.Review(context.Background(), "tech", "22222222-2222-4222-8222-222222222222", StatusApproved, nil); err != nil {
		t.Fatal(err)
	}
	if got := pub.names(); !reflect.DeepEqual(got, []string{"server:11111111-1111-4111-8111-111111111111", "server:s2"}) {
		t.Fatalf("salas: %v", got)
	}
	want := `{"payload":{"server_id":"11111111-1111-4111-8111-111111111111"},"type":"plugins:changed"}`
	if string(pub.rooms["server:11111111-1111-4111-8111-111111111111"]) != want {
		t.Fatalf("evento: %s", pub.rooms["server:11111111-1111-4111-8111-111111111111"])
	}
}

func TestInstallRequiresManageServer(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusApproved}}
	svc, _ := newSvc(st, permission.ErrMissingPermission)
	if err := svc.Install(context.Background(), "11111111-1111-4111-8111-111111111111", "u1", "22222222-2222-4222-8222-222222222222"); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("veio %v", err)
	}
}

func TestInstallRejectsNotApproved(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusPending}}
	svc, _ := newSvc(st, nil)
	if err := svc.Install(context.Background(), "11111111-1111-4111-8111-111111111111", "u1", "22222222-2222-4222-8222-222222222222"); !errors.Is(err, ErrNotApproved) {
		t.Fatalf("veio %v", err)
	}
}

func TestReviewSavedWhenListingServersFails(t *testing.T) {
	st := &fakeStore{plugin: Plugin{Status: StatusPending}, serversErr: errors.New("db fora")}
	svc, pub := newSvc(st, nil)
	p, err := svc.Review(context.Background(), "tech", "22222222-2222-4222-8222-222222222222", StatusApproved, nil)
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
	if err := svc.Install(context.Background(), "11111111-1111-4111-8111-111111111111", "u1", "22222222-2222-4222-8222-222222222222"); err != nil {
		t.Fatal(err)
	}
	if want != permission.ManageServer {
		t.Fatalf("install exigiu %d", want)
	}
	if !reflect.DeepEqual(pub.names(), []string{"server:11111111-1111-4111-8111-111111111111"}) {
		t.Fatalf("install: %v", pub.names())
	}
	want = 0
	pub.rooms = nil
	if err := svc.Uninstall(context.Background(), "11111111-1111-4111-8111-111111111111", "u1", "22222222-2222-4222-8222-222222222222"); err != nil {
		t.Fatal(err)
	}
	if want != permission.ManageServer {
		t.Fatalf("uninstall exigiu %d", want)
	}
	if !reflect.DeepEqual(pub.names(), []string{"server:11111111-1111-4111-8111-111111111111"}) {
		t.Fatalf("uninstall: %v", pub.names())
	}
}

func TestInvalidIDs(t *testing.T) {
	svc, _ := newSvc(&fakeStore{}, nil)
	ctx := context.Background()
	if err := svc.Install(ctx, "11111111-1111-4111-8111-111111111111", "u1", "nao-e-uuid"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("install plugin: %v", err)
	}
	if err := svc.Uninstall(ctx, "11111111-1111-4111-8111-111111111111", "u1", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("uninstall plugin: %v", err)
	}
	if err := svc.SetEnabled(ctx, "11111111-1111-4111-8111-111111111111", "u1", "x", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("setenabled plugin: %v", err)
	}
	if _, err := svc.Review(ctx, "tech", "x", StatusApproved, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("review plugin: %v", err)
	}
	if err := svc.Install(ctx, "x", "u1", "22222222-2222-4222-8222-222222222222"); !errors.Is(err, permission.ErrNotMember) {
		t.Fatalf("install server: %v", err)
	}
	if _, err := svc.ServerPlugins(ctx, "x", "u1"); !errors.Is(err, permission.ErrNotMember) {
		t.Fatalf("list server: %v", err)
	}
	if err := svc.SetEnabled(ctx, "x", "u1", "22222222-2222-4222-8222-222222222222", true); !errors.Is(err, permission.ErrNotMember) {
		t.Fatalf("setenabled server: %v", err)
	}
}

func TestServerPluginsNonMember(t *testing.T) {
	svc, _ := newSvc(&fakeStore{}, permission.ErrNotMember)
	if _, err := svc.ServerPlugins(context.Background(), "11111111-1111-4111-8111-111111111111", "u1"); !errors.Is(err, permission.ErrNotMember) {
		t.Fatalf("veio %v", err)
	}
}

func TestServerPluginsNeverNil(t *testing.T) {
	svc, _ := newSvc(&fakeStore{}, nil)
	got, err := svc.ServerPlugins(context.Background(), "11111111-1111-4111-8111-111111111111", "u1")
	if err != nil || got == nil {
		t.Fatalf("got=%v err=%v", got, err)
	}
}

func TestSetEnabledBroadcastsToUserOnly(t *testing.T) {
	svc, pub := newSvc(&fakeStore{}, nil)
	if err := svc.SetEnabled(context.Background(), "11111111-1111-4111-8111-111111111111", "u1", "22222222-2222-4222-8222-222222222222", true); err != nil {
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

func TestUninstallNotFound(t *testing.T) {
	st := &fakeStore{getErr: ErrNotFound}
	svc, pub := newSvc(st, nil)
	err := svc.Uninstall(context.Background(), "11111111-1111-4111-8111-111111111111", "u1", "22222222-2222-4222-8222-222222222222")
	if !errors.Is(err, ErrNotFound) || st.uninstalled || len(pub.names()) != 0 {
		t.Fatalf("err=%v uninstalled=%v salas=%v", err, st.uninstalled, pub.names())
	}
}

func TestReviewWithdrawRequiresNote(t *testing.T) {
	branco := "   "
	motivo := "virou spam"
	longo := strings.Repeat("é", 501)
	limite := strings.Repeat("é", 500)
	casos := []struct {
		nome string
		de   Status
		para Status
		note *string
		erro error
	}{
		{"retirar sem motivo", StatusApproved, StatusRejected, nil, ErrNoteRequired},
		{"retirar com motivo em branco", StatusApproved, StatusRejected, &branco, ErrNoteRequired},
		{"retirar com motivo", StatusApproved, StatusRejected, &motivo, nil},
		{"recusar pendente sem motivo", StatusPending, StatusRejected, nil, nil},
		{"motivo longo demais", StatusPending, StatusRejected, &longo, ErrInvalidNote},
		{"motivo no limite", StatusApproved, StatusRejected, &limite, nil},
		{"motivo longo ao aprovar", StatusRejected, StatusApproved, &longo, ErrInvalidNote},
	}
	for _, c := range casos {
		t.Run(c.nome, func(t *testing.T) {
			st := &fakeStore{plugin: Plugin{Status: c.de}}
			svc, _ := newSvc(st, nil)
			_, err := svc.Review(context.Background(), "tech", "22222222-2222-4222-8222-222222222222", c.para, c.note)
			if !errors.Is(err, c.erro) {
				t.Fatalf("erro = %v, esperado %v", err, c.erro)
			}
			if c.erro != nil && st.plugin.Status != c.de {
				t.Fatal("não deveria gravar a revisão")
			}
		})
	}
}
