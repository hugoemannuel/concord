package channel

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// modPerms: as permissões de um cargo de moderação típico (as do antigo cargo
// Moderador, que servidor novo não cria mais).
const modPerms = permission.DefaultEveryone | permission.ManageChannels |
	permission.ManageServer |
	permission.MentionEveryone |
	permission.ManageMessages |
	permission.MoveMembers |
	permission.MuteMembers |
	permission.DeafenMembers |
	permission.KickMembers |
	permission.ManageExpressions |
	permission.ManageNicknames |
	permission.DisconnectMembers

// permStore: canais de verdade em memória, com as sobrescritas guardadas no
// mesmo snapshot que responde as permissões.
type permStore struct {
	snap     *permission.Snapshot
	channels map[string]*Channel
	created  []permission.Overwrite
}

func newPermStore() *permStore {
	snap := permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).
		WithRole("mod", 2, modPerms).
		WithRole("gerente", 3, permission.DefaultEveryone|permission.ManageRoles).
		WithRole("vip", 1, 0).
		WithMember("dono").
		WithMember("mod", "mod").
		WithMember("gerente", "gerente").
		WithMember("vip", "vip").
		WithMember("ana").
		WithChannel("geral", TypeText).
		WithChannel("segredo", TypeText,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel},
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: permission.ViewChannel},
		)
	return &permStore{
		snap: snap,
		channels: map[string]*Channel{
			"geral":   {ID: "geral", ServerID: "s1", Name: "geral", Type: TypeText},
			"segredo": {ID: "segredo", ServerID: "s1", Name: "segredo", Type: TypeText, Position: 1},
		},
	}
}

func (f *permStore) Snapshot(_ context.Context, serverID string) (*permission.Snapshot, error) {
	if serverID != "s1" {
		return nil, permission.ErrNotMember
	}
	return f.snap, nil
}

func (f *permStore) Create(_ context.Context, ch *Channel, overwrites []permission.Overwrite) error {
	f.created = overwrites
	f.channels[ch.ID] = ch
	f.snap.WithChannel(ch.ID, ch.Type, append([]permission.Overwrite{}, overwrites...)...)
	return nil
}

func (f *permStore) FindByID(_ context.Context, id string) (*Channel, error) {
	ch, ok := f.channels[id]
	if !ok {
		return nil, ErrChannelNotFound
	}
	copy := *ch
	return &copy, nil
}

func (f *permStore) FindSystemByServerID(context.Context, string) (*Channel, error) {
	return nil, ErrChannelNotFound
}

func (f *permStore) FindNoticesByServerID(context.Context, string) (*Channel, error) {
	return nil, ErrChannelNotFound
}

func (f *permStore) Update(_ context.Context, id string, name string) error {
	if ch, ok := f.channels[id]; ok {
		ch.Name = name
	}
	return nil
}
func (f *permStore) Delete(_ context.Context, id string) error {
	delete(f.channels, id)
	return nil
}

func (f *permStore) ListByServerID(context.Context, string) ([]Channel, error) {
	out := []Channel{}
	for _, ch := range f.channels {
		out = append(out, *ch)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Position < out[j].Position })
	return out, nil
}

func (f *permStore) Reorder(context.Context, string, string, []string) error { return nil }

func (f *permStore) SetOverwrite(_ context.Context, channelID string, o permission.Overwrite) error {
	info := f.snap.Channels[channelID]
	kept := []permission.Overwrite{}
	for _, cur := range info.Overwrites {
		if cur.TargetType != o.TargetType || cur.TargetID != o.TargetID {
			kept = append(kept, cur)
		}
	}
	info.Overwrites = append(kept, o)
	f.snap.Channels[channelID] = info
	return nil
}

func (f *permStore) DeleteOverwrite(_ context.Context, channelID, targetType, targetID string) error {
	info := f.snap.Channels[channelID]
	kept := []permission.Overwrite{}
	for _, cur := range info.Overwrites {
		if cur.TargetType != targetType || cur.TargetID != targetID {
			kept = append(kept, cur)
		}
	}
	info.Overwrites = kept
	f.snap.Channels[channelID] = info
	return nil
}

type permPublisher struct {
	creates     []CreateEvent
	updates     []CreateEvent
	invalidated []string
}

func (p *permPublisher) PublishChannelCreate(e CreateEvent) { p.creates = append(p.creates, e) }
func (p *permPublisher) PublishChannelUpdate(e CreateEvent) { p.updates = append(p.updates, e) }
func (p *permPublisher) PublishChannelDelete(DeleteEvent)   {}
func (p *permPublisher) PublishChannelReorder(ReorderEvent) {}
func (p *permPublisher) PublishPermissionsChanged(id string) {
	p.invalidated = append(p.invalidated, id)
}

func doRequest(t *testing.T, store *permStore, pub *permPublisher, userID, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	auth := func(c *gin.Context) {
		c.Set("userID", userID)
		c.Next()
	}
	ChannelRoutes(router.Group("/api"), ChannelHandler(newService(store, pub), store), auth)
	req := httptest.NewRequest(method, "/api"+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func listedIDs(t *testing.T, rec *httptest.ResponseRecorder) []string {
	t.Helper()
	var channels []Channel
	if err := json.Unmarshal(rec.Body.Bytes(), &channels); err != nil {
		t.Fatalf("%v: %s", err, rec.Body.String())
	}
	ids := []string{}
	for _, ch := range channels {
		ids = append(ids, ch.ID)
	}
	return ids
}

func TestListHidesPrivateChannels(t *testing.T) {
	cases := map[string][]string{
		"dono": {"geral", "segredo"},
		"vip":  {"geral", "segredo"},
		"mod":  {"geral"},
		"ana":  {"geral"},
	}
	for user, want := range cases {
		rec := doRequest(t, newPermStore(), &permPublisher{}, user, http.MethodGet, "/servers/s1/channels", "")
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: status = %d", user, rec.Code)
		}
		if got := listedIDs(t, rec); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: canais = %v, want %v", user, got, want)
		}
	}
	rec := doRequest(t, newPermStore(), &permPublisher{}, "zeca", http.MethodGet, "/servers/s1/channels", "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("não membro: status = %d, want 403", rec.Code)
	}
}

func TestListIncludesOverwrites(t *testing.T) {
	rec := doRequest(t, newPermStore(), &permPublisher{}, "vip", http.MethodGet, "/servers/s1/channels", "")
	var channels []Channel
	_ = json.Unmarshal(rec.Body.Bytes(), &channels)
	for _, ch := range channels {
		if ch.Overwrites == nil {
			t.Fatalf("%s: overwrites devia ser [] e não null", ch.ID)
		}
		if ch.ID == "segredo" && len(ch.Overwrites) != 2 {
			t.Fatalf("segredo: overwrites = %+v", ch.Overwrites)
		}
	}
}

func TestCreateRequiresManageChannels(t *testing.T) {
	rec := doRequest(t, newPermStore(), &permPublisher{}, "ana", http.MethodPost, "/servers/s1/channels", `{"name":"x"}`)
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "missing_permission") {
		t.Fatalf("status = %d (%s), want 403 missing_permission", rec.Code, rec.Body.String())
	}
	rec = doRequest(t, newPermStore(), &permPublisher{}, "mod", http.MethodPost, "/servers/s1/channels", `{"name":"x"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("mod: status = %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestCreatePrivateChannel(t *testing.T) {
	store, pub := newPermStore(), &permPublisher{}
	rec := doRequest(t, store, pub, "mod", http.MethodPost, "/servers/s1/channels", `{"name":"vip-voz","type":"voice","private":true,"role_ids":["vip"]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body.String())
	}
	access := permission.ViewChannel | permission.Connect
	want := []permission.Overwrite{
		{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel},
		{TargetType: permission.TargetRole, TargetID: "vip", Allow: access},
		// mod não tem o vip: entra uma liberação só para ele não se trancar fora.
		{TargetType: permission.TargetMember, TargetID: "mod", Allow: access},
	}
	if !reflect.DeepEqual(store.created, want) {
		t.Fatalf("overwrites = %+v, want %+v", store.created, want)
	}
	if len(pub.creates) != 1 || len(pub.creates[0].Channel.Overwrites) != 3 {
		t.Fatalf("o evento de criação tem que levar as sobrescritas: %+v", pub.creates)
	}
	var id string
	for chID := range store.channels {
		if store.channels[chID].Name == "vip-voz" {
			id = chID
		}
	}
	for user, want := range map[string]bool{"vip": true, "mod": true, "dono": true, "ana": false, "gerente": false} {
		if got := store.snap.CanView(id, user); got != want {
			t.Errorf("%s vê o canal novo = %v, want %v", user, got, want)
		}
	}
}

func TestCreatePrivateSkipsCreatorOverwriteWhenRoleCovers(t *testing.T) {
	snap := newPermStore().snap
	overwrites, err := PrivateOverwrites(snap, TypeText, "vip", []string{"vip"})
	if err != nil {
		t.Fatal(err)
	}
	if len(overwrites) != 2 {
		t.Fatalf("vip já vê pelo cargo, não precisa de sobrescrita própria: %+v", overwrites)
	}
	if overwrites, _ := PrivateOverwrites(snap, TypeText, "dono", nil); len(overwrites) != 1 {
		t.Fatalf("o dono vê tudo: %+v", overwrites)
	}
	if _, err := PrivateOverwrites(snap, TypeText, "dono", []string{"nao-existe"}); !errors.Is(err, ErrInvalidTarget) {
		t.Fatalf("cargo inexistente: err = %v", err)
	}
	if _, err := PrivateOverwrites(snap, TypeText, "dono", []string{"everyone"}); !errors.Is(err, ErrInvalidTarget) {
		t.Fatalf("@everyone como cargo liberado: err = %v", err)
	}
}

func TestUpdateHiddenChannelIsNotFound(t *testing.T) {
	// mod gerencia canais, mas não vê o canal privado: para ele, não existe.
	rec := doRequest(t, newPermStore(), &permPublisher{}, "mod", http.MethodPut, "/servers/s1/channels/segredo", `{"name":"x"}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	rec = doRequest(t, newPermStore(), &permPublisher{}, "mod", http.MethodDelete, "/servers/s1/channels/segredo", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delete: status = %d, want 404", rec.Code)
	}
	rec = doRequest(t, newPermStore(), &permPublisher{}, "mod", http.MethodDelete, "/servers/s1/channels/geral", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("delete geral: status = %d, want 200", rec.Code)
	}
}

func TestSetOverwrite(t *testing.T) {
	store, pub := newPermStore(), &permPublisher{}
	// gerente tem MANAGE_ROLES: tira o SEND do @everyone no geral.
	rec := doRequest(t, store, pub, "gerente", http.MethodPut, "/servers/s1/channels/geral/overwrites/role/everyone",
		`{"allow":0,"deny":256}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body.String())
	}
	if permission.Has(store.snap.Channel("geral", "ana"), permission.SendMessages) {
		t.Fatal("ana ainda escreve no geral")
	}
	if len(pub.updates) != 1 || len(pub.invalidated) != 1 {
		t.Fatalf("eventos: updates=%d invalidated=%v", len(pub.updates), pub.invalidated)
	}

	// Agora o próprio gerente não escreve no geral: não pode liberar SEND
	// para ninguém ali.
	rec = doRequest(t, store, pub, "gerente", http.MethodPut, "/servers/s1/channels/geral/overwrites/member/ana", `{"allow":256,"deny":0}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("gerente sem SEND no canal liberou SEND: status = %d", rec.Code)
	}

	// O dono libera de volta só para a ana (sobrescrita de membro).
	rec = doRequest(t, store, pub, "dono", http.MethodPut, "/servers/s1/channels/geral/overwrites/member/ana", `{"allow":256,"deny":0}`)
	if rec.Code != http.StatusOK || !permission.Has(store.snap.Channel("geral", "ana"), permission.SendMessages) {
		t.Fatalf("status = %d: ana devia escrever de novo", rec.Code)
	}

	// Apagar a sobrescrita do @everyone volta ao padrão.
	rec = doRequest(t, store, pub, "dono", http.MethodDelete, "/servers/s1/channels/geral/overwrites/role/everyone", "")
	if rec.Code != http.StatusOK || !permission.Has(store.snap.Channel("geral", "vip"), permission.SendMessages) {
		t.Fatalf("status = %d: vip devia escrever de novo", rec.Code)
	}
}

func TestSetOverwriteRules(t *testing.T) {
	cases := map[string]struct {
		user, path, body string
		status           int
	}{
		"sem MANAGE_ROLES":           {"mod", "/geral/overwrites/role/everyone", `{"deny":256}`, http.StatusForbidden},
		"bit que não tem":            {"gerente", "/geral/overwrites/role/vip", `{"allow":64}`, http.StatusForbidden},
		"allow e deny juntos":        {"gerente", "/geral/overwrites/role/vip", `{"allow":256,"deny":256}`, http.StatusBadRequest},
		"cargo de fora":              {"gerente", "/geral/overwrites/role/outro", `{"allow":256}`, http.StatusNotFound},
		"membro de fora":             {"gerente", "/geral/overwrites/member/zeca", `{"allow":256}`, http.StatusNotFound},
		"tipo inválido":              {"gerente", "/geral/overwrites/grupo/vip", `{"allow":256}`, http.StatusNotFound},
		"canal que não vê":           {"gerente", "/segredo/overwrites/role/vip", `{"allow":256}`, http.StatusNotFound},
		"dono libera qualquer coisa": {"dono", "/geral/overwrites/role/vip", `{"allow":64}`, http.StatusOK},
	}
	for name, tc := range cases {
		rec := doRequest(t, newPermStore(), &permPublisher{}, tc.user, http.MethodPut, "/servers/s1/channels"+tc.path, tc.body)
		if rec.Code != tc.status {
			t.Errorf("%s: status = %d (%s), want %d", name, rec.Code, rec.Body.String(), tc.status)
		}
	}
}

// Canal de sala de evento (managed): só o evento cria e apaga. Quem gerencia
// canais não renomeia, não apaga e não mexe nas permissões dele pelo app.
func TestManagedChannelCannotBeEditedByHand(t *testing.T) {
	// users: quem teria a permissão de fazer a ação num canal comum (renomear e
	// apagar pedem Gerenciar canais; permissões do canal pedem Gerenciar cargos).
	cases := []struct {
		name, method, path, body string
		users                    []string
	}{
		{"renomear", http.MethodPut, "/servers/s1/channels/sala", `{"name":"x"}`, []string{"mod", "dono"}},
		{"apagar", http.MethodDelete, "/servers/s1/channels/sala", "", []string{"mod", "dono"}},
		{"mudar permissão", http.MethodPut, "/servers/s1/channels/sala/overwrites/role/everyone", `{"allow":0,"deny":256}`, []string{"gerente", "dono"}},
		{"tirar permissão", http.MethodDelete, "/servers/s1/channels/sala/overwrites/member/ana", "", []string{"gerente", "dono"}},
	}
	for _, c := range cases {
		store := newPermStore()
		store.channels["sala"] = &Channel{ID: "sala", ServerID: "s1", Name: "evento-sala", Type: TypeText, Managed: true}
		store.snap.WithChannel("sala", TypeText)
		for _, user := range c.users {
			rec := doRequest(t, store, &permPublisher{}, user, c.method, c.path, c.body)
			if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), `"managed_channel"`) {
				t.Errorf("%s por %s: status %d (%s), esperava 403 managed_channel", c.name, user, rec.Code, rec.Body.String())
			}
		}
		if _, ok := store.channels["sala"]; !ok {
			t.Errorf("%s: o canal gerido sumiu", c.name)
		}
	}
}

func TestManagedFlagIsNeverSetByTheCreateEndpoint(t *testing.T) {
	store := newPermStore()
	rec := doRequest(t, store, &permPublisher{}, "mod", http.MethodPost, "/servers/s1/channels", `{"name":"fake","type":"text","managed":true}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body.String())
	}
	for _, ch := range store.channels {
		if ch.Name == "fake" && ch.Managed {
			t.Fatal("o pedido do usuário não pode criar canal gerido")
		}
	}
}
