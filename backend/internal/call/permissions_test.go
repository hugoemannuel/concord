package call

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/livekit"
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

type fakeMedia struct {
	updates []mediaUpdate
	removed []string
}

type mediaUpdate struct {
	room, identity string
	grant          livekit.Grant
}

func (f *fakeMedia) UpdatePermissions(_ context.Context, room, identity string, g livekit.Grant) error {
	f.updates = append(f.updates, mediaUpdate{room, identity, g})
	return nil
}

func (f *fakeMedia) Remove(_ context.Context, room, identity string) error {
	f.removed = append(f.removed, room+"|"+identity)
	return nil
}

type fakePerms struct{ svc *permission.Service }

func (f fakePerms) Snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error) {
	return f.svc.Snapshot(ctx, serverID)
}

func (f fakePerms) ChannelPerms(ctx context.Context, channelID, userID string) (int64, error) {
	return f.svc.ChannelPerms(ctx, channelID, userID)
}

// voiceSnapshot: dono; chefe (posição 3, acima de mod); mod (posição 2, moderador padrão); vip (1); ana comum.
// Canais de voz: geral (livre), vip-voz (só vip) e palco (@everyone sem falar).
func voiceSnapshot() *permission.Snapshot {
	return permission.NewSnapshot("srv-1", "dono", permission.DefaultEveryone).
		WithRole("chefe", 3, modPerms).
		WithRole("mod", 2, modPerms).
		WithRole("vip", 1, 0).
		WithMember("dono").
		WithMember("chefe", "chefe").
		WithMember("mod", "mod").
		WithMember("mod2", "mod").
		WithMember("vip", "vip").
		WithMember("ana").
		WithChannel("geral", permission.ChannelVoice).
		WithChannel("vip-voz", permission.ChannelVoice,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel | permission.Connect},
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: permission.ViewChannel | permission.Connect},
		).
		WithChannel("palco", permission.ChannelVoice,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.Speak},
		)
}

func newVoiceService(snap *permission.Snapshot) (*Service, *fakeMedia, *capPublisher) {
	pub := newCapPublisher()
	svc := CallService(nil, pub, nil, nil, nil, nil, nil)
	media := &fakeMedia{}
	svc.SetPermissions(fakePerms{permission.NewService(&permission.StaticStore{Snapshots: map[string]*permission.Snapshot{"srv-1": snap}})})
	svc.SetMediaAdmin(media)
	svc.lookupUser = func(_ context.Context, uid string) (UserInfo, error) {
		return UserInfo{ID: uid, Username: uid}, nil
	}
	// Sem banco: sai só da memória.
	svc.leaveCall = func(_ context.Context, callID, userID string) error {
		_, _, err := svc.detachParticipant(callID, userID)
		return err
	}
	return svc, media, pub
}

// putInCall põe os usuários numa chamada ativa do canal.
func putInCall(svc *Service, callID, channelID string, users ...string) {
	srv := "srv-1"
	ch := channelID
	participants := map[string]*participantState{}
	for _, u := range users {
		participants[u] = &participantState{userID: u, role: RoleMember, joinedAt: time.Now()}
		svc.busy[u] = callID
	}
	svc.calls[callID] = &activeCall{
		info:         &Call{ID: callID, Type: TypeChannel, ServerID: &srv, ChannelID: &ch, Status: StatusActive},
		participants: participants,
	}
}

func TestGrantFor(t *testing.T) {
	all := permission.All
	cases := []struct {
		name          string
		perms         int64
		muted, deafen bool
		want          livekit.Grant
	}{
		{"tudo liberado", all, false, false, livekit.Grant{}},
		{"sem falar", all &^ permission.Speak, false, false, livekit.Grant{NoSpeak: true}},
		{"sem transmitir", all &^ permission.Stream, false, false, livekit.Grant{NoStream: true}},
		{"silenciado no servidor", all, true, false, livekit.Grant{NoSpeak: true}},
		{"ensurdecido no servidor", all, false, true, livekit.Grant{NoSubscribe: true}},
		{"sem nada", 0, true, true, livekit.Grant{NoSpeak: true, NoStream: true, NoSubscribe: true}},
	}
	for _, tc := range cases {
		if got := grantFor(tc.perms, tc.muted, tc.deafen); got != tc.want {
			t.Errorf("%s: grant = %+v, want %+v", tc.name, got, tc.want)
		}
	}
}

func TestStartChannelRequiresConnect(t *testing.T) {
	svc, _, _ := newVoiceService(voiceSnapshot())
	ctx := context.Background()
	cases := []struct {
		channel, user string
		want          error
	}{
		{"vip-voz", "ana", ErrNoConnect},
		{"vip-voz", "mod", ErrNoConnect},
		{"vip-voz", "zeca", ErrNotMember},
		{"nao-existe", "ana", ErrNotMember},
	}
	for _, tc := range cases {
		if err := svc.requireConnect(ctx, tc.channel, tc.user); !errors.Is(err, tc.want) {
			t.Errorf("%s em %s: err = %v, want %v", tc.user, tc.channel, err, tc.want)
		}
	}
	for _, tc := range []struct{ channel, user string }{{"geral", "ana"}, {"vip-voz", "vip"}, {"vip-voz", "dono"}, {"palco", "ana"}} {
		if err := svc.requireConnect(ctx, tc.channel, tc.user); err != nil {
			t.Errorf("%s devia entrar em %s: %v", tc.user, tc.channel, err)
		}
	}
	svc.perms = nil
	if err := svc.requireConnect(ctx, "geral", "ana"); err == nil {
		t.Error("sem fonte de permissões ninguém entra (falha fechada)")
	}
}

func TestGrantForParticipantReflectsChannel(t *testing.T) {
	svc, _, _ := newVoiceService(voiceSnapshot())
	putInCall(svc, "c-palco", "palco", "ana", "mod")
	ctx := context.Background()

	if got := svc.GrantFor(ctx, "c-palco", "ana"); !got.NoSpeak || got.NoStream {
		t.Errorf("ana no palco: %+v, devia estar sem falar", got)
	}
	if got := svc.GrantFor(ctx, "c-palco", "mod"); !got.NoSpeak {
		t.Errorf("moderador também sem falar no palco (deny do @everyone vale): %+v", got)
	}
	svc.calls["c-palco"].participants["mod"].serverDeafened = true
	if got := svc.GrantFor(ctx, "c-palco", "mod"); !got.NoSubscribe {
		t.Errorf("ensurdecido no servidor: %+v", got)
	}
	if got := svc.GrantFor(ctx, "nao-existe", "ana"); got != (livekit.Grant{}) {
		t.Errorf("DM/inexistente usa o grant completo: %+v", got)
	}
}

func TestServerMute(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name          string
		actor, target string
		want          error
	}{
		{"moderador silencia membro", "mod", "ana", nil},
		{"dono silencia moderador", "dono", "mod", nil},
		{"membro sem permissão", "ana", "vip", ErrMissingPermission},
		{"mesmo cargo", "mod", "mod2", nil},
		{"cargo acima bloqueado", "mod", "chefe", ErrCannotActOnMember},
		{"sem permissão contra cargo acima", "vip", "mod", ErrMissingPermission},
		{"moderador silencia dono sem cargo acima", "mod", "dono", nil},
		{"moderador silencia a si mesmo", "mod", "mod", nil},
		{"fora da chamada", "mod", "zeca", ErrTargetNotInCall},
		{"não membro como ator", "zeca", "ana", ErrNotMember},
	}
	for _, tc := range cases {
		svc, media, _ := newVoiceService(voiceSnapshot())
		putInCall(svc, "c1", "geral", "ana", "vip", "mod", "mod2", "chefe", "dono")
		err := svc.SetServerMute(ctx, "c1", tc.actor, tc.target, true)
		if !errors.Is(err, tc.want) {
			t.Errorf("%s: err = %v, want %v", tc.name, err, tc.want)
			continue
		}
		muted := svc.calls["c1"].participants[tc.target]
		if tc.want == nil {
			if !muted.serverMuted {
				t.Errorf("%s: não ficou silenciado", tc.name)
			}
			want := []mediaUpdate{{"c1", tc.target, livekit.Grant{NoSpeak: true}}}
			if !reflect.DeepEqual(media.updates, want) {
				t.Errorf("%s: mídia = %+v, want %+v", tc.name, media.updates, want)
			}
		} else if len(media.updates) != 0 || (muted != nil && muted.serverMuted) {
			t.Errorf("%s: não devia mexer em nada", tc.name)
		}
	}
}

func TestServerMuteAnnouncesAndReleases(t *testing.T) {
	svc, media, pub := newVoiceService(voiceSnapshot())
	putInCall(svc, "c1", "geral", "ana", "mod")
	ctx := context.Background()

	if err := svc.SetServerMute(ctx, "c1", "mod", "ana", true); err != nil {
		t.Fatal(err)
	}
	if len(pub.callEvents["c1"]) != 1 || len(pub.serverEvents["server:srv-1"]) != 1 {
		t.Fatalf("o estado de voz vai para a chamada e para o servidor: %v", pub)
	}
	infos := svc.participantInfos("c1")
	for _, info := range infos {
		if info.UserID == "ana" && !info.ServerMuted {
			t.Fatal("o estado da chamada tem que mostrar server_muted")
		}
	}

	// Liberar devolve o microfone.
	if err := svc.SetServerMute(ctx, "c1", "mod", "ana", false); err != nil {
		t.Fatal(err)
	}
	if last := media.updates[len(media.updates)-1]; last.grant != (livekit.Grant{}) {
		t.Fatalf("ao liberar o grant volta ao completo: %+v", last.grant)
	}
}

func TestServerDeafenNeedsItsOwnPermission(t *testing.T) {
	snap := voiceSnapshot().WithRole("silenciador", 1, permission.MuteMembers).WithMember("sil", "silenciador").WithMember("alvo")
	svc, media, _ := newVoiceService(snap)
	putInCall(svc, "c1", "geral", "alvo", "sil")
	ctx := context.Background()

	if err := svc.SetServerDeafen(ctx, "c1", "sil", "alvo", true); !errors.Is(err, ErrMissingPermission) {
		t.Fatalf("MUTE_MEMBERS não ensurdece: err = %v", err)
	}
	if err := svc.SetServerMute(ctx, "c1", "sil", "alvo", true); err != nil {
		t.Fatalf("MUTE_MEMBERS silencia: %v", err)
	}
	if err := svc.SetServerDeafen(ctx, "c1", "mod", "alvo", true); err != nil {
		t.Fatal(err)
	}
	last := media.updates[len(media.updates)-1]
	if !last.grant.NoSubscribe || !last.grant.NoSpeak {
		t.Fatalf("silenciado e ensurdecido ao mesmo tempo: %+v", last.grant)
	}
}

func TestServerMuteOnlyInServerChannelCalls(t *testing.T) {
	svc, _, _ := newVoiceService(voiceSnapshot())
	svc.calls["dm"] = &activeCall{
		info:         &Call{ID: "dm", Type: TypeDM, Status: StatusActive},
		participants: map[string]*participantState{"ana": {userID: "ana"}, "mod": {userID: "mod"}},
	}
	ctx := context.Background()
	if err := svc.SetServerMute(ctx, "dm", "mod", "ana", true); !errors.Is(err, ErrNotChannelCall) {
		t.Fatalf("err = %v, want ErrNotChannelCall", err)
	}
	if err := svc.SetServerMute(ctx, "nada", "mod", "ana", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestServerVoiceHierarchyAndSelfUnmute(t *testing.T) {
	snap := voiceSnapshot().WithMember("multi", "vip", "chefe")
	svc, media, _ := newVoiceService(snap)
	putInCall(svc, "c1", "geral", "mod", "mod2", "chefe", "multi", "dono")
	ctx := context.Background()

	// Moderador silencia e ensurdece mesmo cargo e dono sem cargo acima.
	for _, target := range []string{"mod2", "dono"} {
		if err := svc.SetServerMute(ctx, "c1", "mod", target, true); err != nil {
			t.Fatalf("silenciar %s: %v", target, err)
		}
		if err := svc.SetServerDeafen(ctx, "c1", "mod", target, true); err != nil {
			t.Fatalf("ensurdecer %s: %v", target, err)
		}
	}

	// Cargo acima (incluindo múltiplo cargo cujo maior é 3) é bloqueado em mute e deafen.
	for _, target := range []string{"chefe", "multi"} {
		if err := svc.SetServerMute(ctx, "c1", "mod", target, true); !errors.Is(err, ErrCannotActOnMember) {
			t.Fatalf("silenciar %s: err = %v, want ErrCannotActOnMember", target, err)
		}
		if err := svc.SetServerDeafen(ctx, "c1", "mod", target, true); !errors.Is(err, ErrCannotActOnMember) {
			t.Fatalf("ensurdecer %s: err = %v, want ErrCannotActOnMember", target, err)
		}
	}

	// Dono consegue se liberar (microfone e áudio) sem precisar de outro moderador.
	if err := svc.SetServerMute(ctx, "c1", "dono", "dono", false); err != nil {
		t.Fatalf("dono se desmutar: %v", err)
	}
	if err := svc.SetServerDeafen(ctx, "c1", "dono", "dono", false); err != nil {
		t.Fatalf("dono se desensurdecer: %v", err)
	}
	if last := media.updates[len(media.updates)-1]; last.identity != "dono" || last.grant != (livekit.Grant{}) {
		t.Fatalf("grant do dono após se liberar = %+v, want completo", last)
	}

	// Dono com cargo acima fica protegido contra moderador abaixo, mas continua podendo agir sobre todos.
	snapDonoAlto := voiceSnapshot().WithMember("dono", "chefe")
	svcAlto, _, _ := newVoiceService(snapDonoAlto)
	putInCall(svcAlto, "c1", "geral", "mod", "chefe", "dono")
	if err := svcAlto.SetServerMute(ctx, "c1", "mod", "dono", true); !errors.Is(err, ErrCannotActOnMember) {
		t.Fatalf("silenciar dono com cargo acima: err = %v, want ErrCannotActOnMember", err)
	}
	if err := svcAlto.SetServerDeafen(ctx, "c1", "mod", "dono", true); !errors.Is(err, ErrCannotActOnMember) {
		t.Fatalf("ensurdecer dono com cargo acima: err = %v, want ErrCannotActOnMember", err)
	}
	if err := svcAlto.SetServerMute(ctx, "c1", "dono", "chefe", true); err != nil {
		t.Fatalf("dono silencia chefe: %v", err)
	}
}

func TestDisconnectParticipant(t *testing.T) {
	svc, media, _ := newVoiceService(voiceSnapshot())
	putInCall(svc, "c1", "geral", "ana", "mod", "mod2", "chefe", "dono", "vip")
	ctx := context.Background()

	if err := svc.DisconnectParticipant(ctx, "c1", "ana", "vip"); !errors.Is(err, ErrMissingPermission) {
		t.Fatalf("membro desconectando: err = %v", err)
	}
	if err := svc.DisconnectParticipant(ctx, "c1", "mod", "chefe"); !errors.Is(err, ErrCannotActOnMember) {
		t.Fatalf("desconectar cargo acima: err = %v, want ErrCannotActOnMember", err)
	}
	if err := svc.DisconnectParticipant(ctx, "c1", "mod", "ana"); err != nil {
		t.Fatal(err)
	}
	if err := svc.DisconnectParticipant(ctx, "c1", "mod", "mod2"); err != nil {
		t.Fatalf("desconectar mesmo cargo: %v", err)
	}
	if err := svc.DisconnectParticipant(ctx, "c1", "mod", "dono"); err != nil {
		t.Fatalf("desconectar dono sem cargo acima: %v", err)
	}
	wantRemoved := []string{"c1|ana", "c1|mod2", "c1|dono"}
	if !reflect.DeepEqual(media.removed, wantRemoved) {
		t.Fatalf("mídia removida: %v, want %v", media.removed, wantRemoved)
	}
	if svc.IsParticipant("c1", "ana") || svc.IsParticipant("c1", "dono") || !svc.IsParticipant("c1", "vip") || !svc.IsParticipant("c1", "chefe") {
		t.Fatal("apenas ana, mod2 e dono deviam sair")
	}

	snapDonoAlto := voiceSnapshot().WithMember("dono", "chefe")
	svcAlto, _, _ := newVoiceService(snapDonoAlto)
	putInCall(svcAlto, "c1", "geral", "mod", "dono")
	if err := svcAlto.DisconnectParticipant(ctx, "c1", "mod", "dono"); !errors.Is(err, ErrCannotActOnMember) {
		t.Fatalf("desconectar dono com cargo acima: err = %v, want ErrCannotActOnMember", err)
	}
}

func TestRevalidateServerRemovesAndUpdates(t *testing.T) {
	snap := voiceSnapshot()
	svc, media, _ := newVoiceService(snap)
	putInCall(svc, "c-vip", "vip-voz", "vip", "ana", "mod")
	putInCall(svc, "c-palco", "palco", "ana2")
	snap.WithMember("ana2")
	ctx := context.Background()

	// ana e mod estão num canal que não podem usar: saem. vip fica.
	svc.RevalidateServer(ctx, "srv-1")
	if svc.IsParticipant("c-vip", "ana") || svc.IsParticipant("c-vip", "mod") {
		t.Fatal("quem perdeu acesso tem que sair da chamada")
	}
	if !svc.IsParticipant("c-vip", "vip") {
		t.Fatal("vip continua")
	}
	wantRemoved := map[string]bool{"c-vip|ana": true, "c-vip|mod": true}
	for _, r := range media.removed {
		delete(wantRemoved, r)
	}
	if len(wantRemoved) != 0 {
		t.Fatalf("faltou remover da mídia: %v", wantRemoved)
	}

	// Quem fica tem a mídia atualizada (ana2 não pode falar no palco).
	found := false
	for _, u := range media.updates {
		if u.identity == "ana2" && u.grant.NoSpeak {
			found = true
		}
	}
	if !found {
		t.Fatalf("ana2 devia ficar sem falar: %+v", media.updates)
	}
}

func TestRemoveFromServerCalls(t *testing.T) {
	svc, media, _ := newVoiceService(voiceSnapshot())
	putInCall(svc, "c1", "geral", "ana", "mod")
	putInCall(svc, "c2", "palco", "vip")
	svc.RemoveFromServerCalls(context.Background(), "srv-1", "ana")
	if svc.IsParticipant("c1", "ana") || !svc.IsParticipant("c1", "mod") || !svc.IsParticipant("c2", "vip") {
		t.Fatal("só a ana devia sair da chamada")
	}
	if !reflect.DeepEqual(media.removed, []string{"c1|ana"}) {
		t.Fatalf("mídia: %v", media.removed)
	}
}

func TestVisibleStatesFiltersPrivateChannels(t *testing.T) {
	svc, _, _ := newVoiceService(voiceSnapshot())
	geral, vipVoz := "geral", "vip-voz"
	states := []*StateResponse{
		{Call: &Call{ID: "a", ChannelID: &geral}},
		{Call: &Call{ID: "b", ChannelID: &vipVoz}},
	}
	ids := func(list []*StateResponse) []string {
		out := []string{}
		for _, st := range list {
			out = append(out, st.Call.ID)
		}
		return out
	}
	ctx := context.Background()
	if got := ids(svc.VisibleStates(ctx, "srv-1", "ana", states)); !reflect.DeepEqual(got, []string{"a"}) {
		t.Errorf("ana vê %v", got)
	}
	if got := ids(svc.VisibleStates(ctx, "srv-1", "vip", states)); !reflect.DeepEqual(got, []string{"a", "b"}) {
		t.Errorf("vip vê %v", got)
	}
	if got := svc.VisibleStates(ctx, "srv-1", "zeca", states); len(got) != 0 {
		t.Errorf("não membro não vê nada: %v", ids(got))
	}
}

func TestSoundboardNeedsPermissionAndNoServerMute(t *testing.T) {
	snap := voiceSnapshot().
		WithChannel("sem-som", permission.ChannelVoice,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.UseSoundboard})
	svc, _, _ := newVoiceService(snap)
	svc.SetSoundLookup(fakeSoundLookup{sounds: map[string]SoundInfo{"s": {ID: "s", ServerID: "srv-1"}}})
	putInCall(svc, "c-sem", "sem-som", "ana")
	putInCall(svc, "c-ok", "geral", "ana2", "ana3")
	snap.WithMember("ana2").WithMember("ana3")
	ctx := context.Background()

	if err := svc.TriggerSoundboard(ctx, "c-sem", "ana", "s"); !errors.Is(err, ErrSoundboardNoPermission) {
		t.Fatalf("err = %v, want ErrSoundboardNoPermission", err)
	}
	// Favorito de outro servidor também respeita o "Usar mesa de áudio" daqui.
	svc.SetSoundLookup(fakeSoundLookup{
		sounds:    map[string]SoundInfo{"s": {ID: "s", ServerID: "srv-1"}, "fav": {ID: "fav", ServerID: "srv-9"}},
		favorites: map[string]bool{"ana:fav": true},
	})
	svc.calls["c-sem"].participants["ana"].lastSoundAt = time.Time{}
	if err := svc.TriggerSoundboard(ctx, "c-sem", "ana", "fav"); !errors.Is(err, ErrSoundboardNoPermission) {
		t.Fatalf("favorito sem permissão: err = %v, want ErrSoundboardNoPermission", err)
	}
	if err := svc.TriggerSoundboard(ctx, "c-ok", "ana2", "s"); err != nil {
		t.Fatalf("devia tocar: %v", err)
	}
	svc.calls["c-ok"].participants["ana3"].serverMuted = true
	if err := svc.TriggerSoundboard(ctx, "c-ok", "ana3", "s"); !errors.Is(err, ErrSoundboardMuted) {
		t.Fatalf("silenciado no servidor não toca: err = %v", err)
	}
}

func TestAuthorizeMove(t *testing.T) {
	snap := voiceSnapshot().
		WithChannel("jogos", permission.ChannelVoice).
		WithChannel("so-mod", permission.ChannelVoice,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel | permission.Connect},
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "mod", Allow: permission.ViewChannel | permission.Connect},
		).
		WithChannel("sem-mover", permission.ChannelVoice,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "mod", Deny: permission.MoveMembers},
		)
	in := func(channel string) voiceLocation {
		return voiceLocation{callID: "c1", channelID: channel, serverID: "srv-1"}
	}
	dest := func(id string) *channel.Channel {
		return &channel.Channel{ID: id, ServerID: "srv-1", Type: channel.TypeVoice}
	}

	cases := []struct {
		name          string
		actor, target string
		from, to      string
		want          error
	}{
		{"moderador move membro", "mod", "ana", "geral", "jogos", nil},
		{"dono move moderador", "dono", "mod", "geral", "jogos", nil},
		{"membro não move", "ana", "vip", "geral", "jogos", ErrNotModerator},
		{"MOVE_MEMBERS é do canal de origem", "mod", "ana", "sem-mover", "jogos", ErrNotModerator},
		{"moderador move o dono sem cargo acima", "mod", "dono", "geral", "jogos", nil},
		{"moderador não move cargo acima", "mod", "chefe", "geral", "jogos", ErrCannotActOnMember},
		{"mesmo cargo", "mod", "mod2", "geral", "jogos", nil},
		{"destino que o ator não vê", "mod", "ana", "geral", "vip-voz", ErrNotFound},
		{"destino onde o alvo não entra", "mod", "ana", "geral", "so-mod", ErrTargetCannotJoin},
		{"destino liberado ao alvo", "dono", "mod", "geral", "so-mod", nil},
		{"mesmo canal", "mod", "ana", "geral", "geral", ErrSameChannel},
	}
	for _, tc := range cases {
		err := authorizeMove(snap, tc.actor, tc.target, in(tc.from), true, dest(tc.to))
		if !errors.Is(err, tc.want) {
			t.Errorf("%s: err = %v, want %v", tc.name, err, tc.want)
		}
	}

	snapDonoAlto := voiceSnapshot().WithChannel("jogos", permission.ChannelVoice).WithMember("dono", "chefe")
	if err := authorizeMove(snapDonoAlto, "mod", "dono", in("geral"), true, dest("jogos")); !errors.Is(err, ErrCannotActOnMember) {
		t.Errorf("moderador não move dono com cargo acima: err = %v, want ErrCannotActOnMember", err)
	}
}

// Silenciar/ensurdecer de moderador vai para o banco como o mudo normal: um
// deploy recarrega e não libera ninguém.
func TestServerVoiceIsSavedAndSurvivesRestart(t *testing.T) {
	svc, _, _ := newVoiceService(voiceSnapshot())
	putInCall(svc, "c1", "geral", "ana", "mod")
	store := &fakeStateStore{}
	svc.stateStore = store
	ctx := context.Background()

	if err := svc.SetServerMute(ctx, "c1", "mod", "ana", true); err != nil {
		t.Fatal(err)
	}
	if err := svc.SetServerDeafen(ctx, "c1", "mod", "ana", true); err != nil {
		t.Fatal(err)
	}
	want := []string{"c1/ana/sim/nao", "c1/ana/sim/sim"}
	if !reflect.DeepEqual(store.server, want) {
		t.Fatalf("gravado = %v, want %v", store.server, want)
	}
	// Ação recusada não grava nada.
	if err := svc.SetServerMute(ctx, "c1", "ana", "mod", true); err == nil {
		t.Fatal("membro silenciou moderador")
	}
	if len(store.server) != 2 {
		t.Fatalf("gravou ação recusada: %v", store.server)
	}

	// Reinício: o processo novo lê o banco.
	srv, ch := "srv-1", "geral"
	restarted, _, _ := newVoiceService(voiceSnapshot())
	restarted.restore(
		[]*Call{{ID: "c1", Type: TypeChannel, Status: StatusActive, ServerID: &srv, ChannelID: &ch}},
		map[string][]CallParticipant{"c1": {
			{CallID: "c1", UserID: "ana", Role: RoleMember, ServerMuted: true, ServerDeafened: true},
			{CallID: "c1", UserID: "mod", Role: RoleMember},
		}},
	)
	for _, info := range restarted.participantInfos("c1") {
		if info.UserID == "ana" && (!info.ServerMuted || !info.ServerDeafened) {
			t.Fatalf("depois do reinício ana = %+v, want silenciada e ensurdecida", info)
		}
		if info.UserID == "mod" && (info.ServerMuted || info.ServerDeafened) {
			t.Fatalf("depois do reinício mod = %+v, want livre", info)
		}
	}
	// O token novo (o app pede ao reconectar) continua sem microfone e sem áudio.
	if g := restarted.GrantFor(ctx, "c1", "ana"); !g.NoSpeak || !g.NoSubscribe {
		t.Fatalf("grant depois do reinício = %+v, want NoSpeak e NoSubscribe", g)
	}
}
