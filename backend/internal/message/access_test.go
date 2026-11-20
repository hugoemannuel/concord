package message

import (
	"context"
	"errors"
	"testing"

	"gin-quickstart/backend/internal/permission"
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

// snapPerms responde ChannelPerms a partir de um snapshot em memória.
type snapPerms struct{ svc *permission.Service }

func newSnapPerms(snap *permission.Snapshot) snapPerms {
	return snapPerms{permission.NewService(&permission.StaticStore{Snapshots: map[string]*permission.Snapshot{"s1": snap}})}
}

func (p snapPerms) ChannelPerms(ctx context.Context, channelID, userID string) (int64, error) {
	return p.svc.ChannelPerms(ctx, channelID, userID)
}

func accessSnapshot() *permission.Snapshot {
	return permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).
		WithRole("mod", 2, modPerms).
		WithRole("vip", 1, 0).
		WithRole("mudo", 1, 0).
		WithMember("dono").
		WithMember("mod", "mod").
		WithMember("vip", "vip").
		WithMember("ana").
		WithMember("quieto", "mudo").
		WithChannel("geral", permission.ChannelText,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "mudo", Deny: permission.SendMessages | permission.AttachFiles},
		).
		WithChannel("anuncios", permission.ChannelText,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.SendMessages},
		).
		WithChannel("segredo", permission.ChannelText,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel},
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "vip", Allow: permission.ViewChannel},
		)
}

func TestChannelAccess(t *testing.T) {
	perms := newSnapPerms(accessSnapshot())
	ctx := context.Background()
	view := permission.ViewChannel
	write := permission.ViewChannel | permission.SendMessages | permission.AttachFiles

	cases := []struct {
		name    string
		channel string
		user    string
		want    int64
		err     error
	}{
		{"membro lê o geral", "geral", "ana", view, nil},
		{"membro escreve no geral", "geral", "ana", write, nil},
		{"castigado lê", "geral", "quieto", view, nil},
		{"castigado não escreve", "geral", "quieto", write, ErrNoRoomAccess},
		{"anúncios: todos leem", "anuncios", "ana", view, nil},
		{"anúncios: ninguém escreve", "anuncios", "ana", write, ErrNoRoomAccess},
		{"anúncios: moderador não ignora o deny", "anuncios", "mod", write, ErrNoRoomAccess},
		{"anúncios: dono escreve", "anuncios", "dono", write, nil},
		{"privado: quem não vê, não acha", "segredo", "ana", view, ErrRoomNotFound},
		{"privado: moderador não vê", "segredo", "mod", view, ErrRoomNotFound},
		{"privado: cargo liberado lê", "segredo", "vip", view, nil},
		{"privado: dono lê", "segredo", "dono", view, nil},
		{"fora do servidor", "geral", "zeca", view, ErrNoRoomAccess},
		{"canal inexistente", "nada", "ana", view, ErrRoomNotFound},
	}
	for _, tc := range cases {
		err := channelAccess(ctx, perms, tc.channel, tc.user, tc.want)
		if !errors.Is(err, tc.err) {
			t.Errorf("%s: err = %v, want %v", tc.name, err, tc.err)
		}
	}
}

// O chat do canal de voz usa as mesmas rotas e regras do canal de texto: lê
// quem vê o canal (mesmo sem conectar) e escreve quem pode enviar.
func TestVoiceChannelChatAccess(t *testing.T) {
	snap := accessSnapshot().
		WithChannel("call", permission.ChannelVoice).
		WithChannel("call-mudo", permission.ChannelVoice,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.SendMessages},
		).
		WithChannel("call-sem-entrar", permission.ChannelVoice,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.Connect},
		).
		WithChannel("call-privada", permission.ChannelVoice,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel},
		)
	perms := newSnapPerms(snap)
	ctx := context.Background()
	read := permission.ViewChannel | permission.ReadHistory
	write := permission.ViewChannel | permission.SendMessages | permission.AttachFiles

	cases := []struct {
		name    string
		channel string
		want    int64
		err     error
	}{
		{"membro lê o chat da call", "call", read, nil},
		{"membro escreve no chat da call", "call", write, nil},
		{"sem enviar no canal de voz, só lê", "call-mudo", write, ErrNoRoomAccess},
		{"sem conectar ainda lê o chat", "call-sem-entrar", read, nil},
		{"sem conectar ainda escreve no chat", "call-sem-entrar", write, nil},
		{"canal de voz privado: não acha o chat", "call-privada", read, ErrRoomNotFound},
	}
	for _, tc := range cases {
		err := channelAccess(ctx, perms, tc.channel, "ana", tc.want)
		if !errors.Is(err, tc.err) {
			t.Errorf("%s: err = %v, want %v", tc.name, err, tc.err)
		}
	}
}

func TestCanModerateMessages(t *testing.T) {
	// Quem apaga: o autor, ou quem tem MANAGE_MESSAGES no canal.
	snap := accessSnapshot()
	snap.WithRole("faxineiro", 1, permission.ManageMessages).WithMember("fax", "faxineiro")
	s := &Service{perms: newSnapPerms(snap)}
	ctx := context.Background()

	cases := []struct {
		name            string
		channel         string
		author, deleter string
		err             error
	}{
		{"autor apaga a própria", "geral", "ana", "ana", nil},
		{"membro não apaga de outro", "geral", "vip", "ana", ErrNotAuthor},
		{"moderador apaga de outro", "geral", "ana", "mod", nil},
		{"dono apaga de outro", "geral", "ana", "dono", nil},
		{"cargo só com MANAGE_MESSAGES apaga", "geral", "ana", "fax", nil},
		{"MANAGE_MESSAGES no servidor não vale em canal que não vê", "segredo", "vip", "fax", ErrMessageNotFound},
		{"moderador não apaga no canal privado que não vê", "segredo", "vip", "mod", ErrMessageNotFound},
		{"autor que perdeu acesso não apaga", "segredo", "ana", "ana", ErrMessageNotFound},
	}
	for _, tc := range cases {
		err := s.canModerate(ctx, tc.channel, tc.author, tc.deleter)
		if !errors.Is(err, tc.err) {
			t.Errorf("%s: err = %v, want %v", tc.name, err, tc.err)
		}
	}
}

func TestResolveMentionEveryoneUsesChannelPermission(t *testing.T) {
	snap := accessSnapshot().WithChannel("sem-ping", permission.ChannelText,
		permission.Overwrite{TargetType: permission.TargetRole, TargetID: "mod", Deny: permission.MentionEveryone},
	)
	s := MessageService(nil, nil, nil, nil, nil, newSnapPerms(snap))
	ctx := context.Background()

	if got := everyoneOf(s, ctx, "s1", "geral", "mod", "@all"); got == nil {
		t.Fatal("moderador pinga no geral")
	}
	if got := everyoneOf(s, ctx, "s1", "sem-ping", "mod", "@all"); got != nil {
		t.Fatal("deny de MENTION_EVERYONE no canal tem que valer")
	}
	if got := everyoneOf(s, ctx, "s1", "geral", "ana", "@all"); got != nil {
		t.Fatal("membro comum não pinga")
	}
}
