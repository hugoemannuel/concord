package push

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/notifysettings"
	"gin-quickstart/backend/internal/platform/fcm"
	"gin-quickstart/backend/internal/user"
)

type fakePresence struct {
	online map[string]bool
	status map[string]string
}

func (p fakePresence) IsAppOpen(id string) bool { return p.online[id] }
func (p fakePresence) EffectiveStatus(id string) string {
	if s, ok := p.status[id]; ok {
		return s
	}
	return "offline"
}

type fakeSettings struct {
	all   map[string]notifysettings.All
	calls *queryCalls
}

// queryCalls conta as idas "ao banco" dos fakes (uma por pessoa x uma em lote),
// guarda os ids da última consulta em lote e pode falhar.
type queryCalls struct {
	single, batch int
	batchIDs      []string
	err           error
}

func (s fakeSettings) All(_ context.Context, id string) (notifysettings.All, error) {
	s.calls.single++
	return s.all[id], nil
}

func (s fakeSettings) AllFor(_ context.Context, ids []string) (map[string]notifysettings.All, error) {
	s.calls.batch++
	s.calls.batchIDs = ids
	if s.calls.err != nil {
		return nil, s.calls.err
	}
	out := map[string]notifysettings.All{}
	for _, id := range ids {
		out[id] = s.all[id]
	}
	return out, nil
}

type fakeDir struct {
	channelName string
	convName    string
	group       bool
	members     []string
	byUsername  map[string]string // username -> id
}

func (d fakeDir) ChannelName(context.Context, string) (string, error) { return d.channelName, nil }
func (d fakeDir) ConversationName(context.Context, string) (string, bool, error) {
	return d.convName, d.group, nil
}
func (d fakeDir) ServerMemberIDs(context.Context, string) ([]string, error) { return d.members, nil }
func (d fakeDir) MemberIDsByUsername(_ context.Context, _ string, names []string) ([]string, error) {
	var ids []string
	for _, n := range names {
		if id, ok := d.byUsername[n]; ok {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

type fakeAccess struct{ deny map[string]bool }

func (a fakeAccess) CanView(_ context.Context, _ string, userID string) bool { return !a.deny[userID] }

type fakeTokens struct {
	tokens  map[string][]string
	deleted []string
	calls   queryCalls
}

func (t *fakeTokens) TokensForUser(_ context.Context, id string) ([]string, error) {
	t.calls.single++
	return t.tokens[id], nil
}

func (t *fakeTokens) TokensForUsers(_ context.Context, ids []string) (map[string][]string, error) {
	t.calls.batch++
	t.calls.batchIDs = ids
	if t.calls.err != nil {
		return nil, t.calls.err
	}
	out := map[string][]string{}
	for _, id := range ids {
		out[id] = t.tokens[id]
	}
	return out, nil
}
func (t *fakeTokens) Delete(_ context.Context, token string) error {
	t.deleted = append(t.deleted, token)
	return nil
}

type fakeSender struct {
	disabled bool
	sent     []fcm.Message
	errs     map[string]error
}

func (s *fakeSender) Enabled() bool { return !s.disabled }
func (s *fakeSender) Send(_ context.Context, m fcm.Message) error {
	s.sent = append(s.sent, m)
	return s.errs[m.Token]
}

type rig struct {
	n        *Notifier
	sender   *fakeSender
	tokens   *fakeTokens
	presence fakePresence
	settings fakeSettings
	dir      fakeDir
	access   fakeAccess
}

var fixedNow = time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)

// newRig: Ana (u-ana) e Bia (u-bia) com aparelho cada; todo mundo offline por padrão.
func newRig() *rig {
	r := &rig{
		sender:   &fakeSender{errs: map[string]error{}},
		tokens:   &fakeTokens{tokens: map[string][]string{"u-ana": {"tok-ana"}, "u-bia": {"tok-bia"}, "u-caio": {"tok-caio"}}},
		presence: fakePresence{online: map[string]bool{}, status: map[string]string{}},
		settings: fakeSettings{all: map[string]notifysettings.All{}, calls: &queryCalls{}},
		dir:      fakeDir{channelName: "geral", byUsername: map[string]string{"ana_mobile": "u-ana", "bia_web": "u-bia", "caio_dev": "u-caio"}, members: []string{"u-ana", "u-bia", "u-caio", "u-autor"}},
		access:   fakeAccess{deny: map[string]bool{}},
	}
	r.build()
	return r
}

// build recria o Notifier com o estado atual dos fakes (os testes mexem nos fakes antes de chamar).
func (r *rig) build() {
	r.n = NewNotifier(Deps{
		Presence: r.presence, Settings: r.settings, Directory: r.dir, Access: r.access,
		Tokens: r.tokens, Sender: r.sender, Run: func(f func()) { f() }, Now: func() time.Time { return fixedNow },
	})
}

func author() *message.Author {
	return &message.Author{ID: "u-autor", Username: "autor", DisplayName: "Autor"}
}

func dmEvent(content string, to ...string) message.CreateEvent {
	conv := "conv-1"
	return message.CreateEvent{
		ConversationID: &conv,
		UserIDs:        append([]string{"u-autor"}, to...),
		Message:        message.Message{ID: "m1", AuthorID: "u-autor", Author: author(), ConversationID: &conv, Content: content},
	}
}

func channelEvent(content string, everyone *string) message.CreateEvent {
	ch := "chan-1"
	return message.CreateEvent{
		ChannelID: &ch, ServerID: "srv-1",
		Message: message.Message{ID: "m2", AuthorID: "u-autor", Author: author(), ChannelID: &ch, Content: content, MentionEveryone: everyone},
	}
}

func sentTo(r *rig) []string {
	var tokens []string
	for _, m := range r.sender.sent {
		tokens = append(tokens, m.Token)
	}
	return tokens
}

func expectTokens(t *testing.T, r *rig, want ...string) {
	t.Helper()
	got := sentTo(r)
	if len(got) != len(want) {
		t.Fatalf("enviou para %v, esperava %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("enviou para %v, esperava %v", got, want)
		}
	}
}

func ptr(s string) *string { return &s }

func TestDM(t *testing.T) {
	t.Run("DM para quem está offline vira push com título, texto e dados", func(t *testing.T) {
		r := newRig()
		r.n.OnMessage(dmEvent("oi, tudo bem?", "u-ana"))
		expectTokens(t, r, "tok-ana")
		m := r.sender.sent[0]
		if m.Title != "Autor" || m.Body != "oi, tudo bem?" {
			t.Fatalf("título/texto = %q / %q", m.Title, m.Body)
		}
		want := map[string]string{"type": "dm", "conversation_id": "conv-1", "conversation_type": "dm", "name": "Autor", "message_id": "m1"}
		for k, v := range want {
			if m.Data[k] != v {
				t.Fatalf("data[%s] = %q, esperava %q (data=%v)", k, m.Data[k], v, m.Data)
			}
		}
	})

	t.Run("o autor nunca se notifica", func(t *testing.T) {
		r := newRig()
		r.tokens.tokens["u-autor"] = []string{"tok-autor"}
		r.n.OnMessage(dmEvent("oi", "u-ana"))
		expectTokens(t, r, "tok-ana")
	})

	t.Run("quem está com o app aberto (online) não recebe", func(t *testing.T) {
		r := newRig()
		r.presence.online["u-ana"] = true
		r.build()
		r.n.OnMessage(dmEvent("oi", "u-ana", "u-bia"))
		expectTokens(t, r, "tok-bia")
	})

	t.Run("Não perturbar não recebe", func(t *testing.T) {
		r := newRig()
		r.presence.status["u-ana"] = "dnd"
		r.build()
		r.n.OnMessage(dmEvent("oi", "u-ana"))
		expectTokens(t, r)
	})

	t.Run("grupo: título com o nome do grupo e dados do grupo, um push para cada um", func(t *testing.T) {
		r := newRig()
		r.dir.convName, r.dir.group = "DEVS", true
		r.build()
		r.n.OnMessage(dmEvent("fala, time", "u-ana", "u-bia"))
		expectTokens(t, r, "tok-ana", "tok-bia")
		m := r.sender.sent[0]
		if m.Title != "Autor · DEVS" || m.Data["conversation_type"] != "group" || m.Data["name"] != "DEVS" {
			t.Fatalf("grupo: %q %v", m.Title, m.Data)
		}
	})

	t.Run("mensagem do sistema não notifica", func(t *testing.T) {
		r := newRig()
		ev := dmEvent("aniversário!", "u-ana")
		ev.Message.SystemKind = ptr("birthday")
		r.n.OnMessage(ev)
		expectTokens(t, r)
	})

	t.Run("só anexo: texto 'Enviou um anexo'", func(t *testing.T) {
		r := newRig()
		ev := dmEvent("", "u-ana")
		ev.Message.Attachments = []message.Attachment{{}}
		r.n.OnMessage(ev)
		if got := r.sender.sent[0].Body; got != "Enviou um anexo" {
			t.Fatalf("texto = %q", got)
		}
	})

	t.Run("TestNotificacaoViewOnceSemTexto: usa o rótulo da visualização única", func(t *testing.T) {
		r := newRig()
		ev := dmEvent("", "u-ana")
		ev.Message.ViewOnce = &message.ViewOnceMedia{ID: "a1", Kind: "image"}
		r.n.OnMessage(ev)
		if got := r.sender.sent[0].Body; got != "Foto de visualização única" {
			t.Fatalf("texto = %q", got)
		}
	})

	t.Run("visualização única com texto: o texto vai no corpo", func(t *testing.T) {
		r := newRig()
		ev := dmEvent("olha isso", "u-ana")
		ev.Message.ViewOnce = &message.ViewOnceMedia{ID: "a1", Kind: "video"}
		r.n.OnMessage(ev)
		if got := r.sender.sent[0].Body; got != "olha isso" {
			t.Fatalf("texto = %q", got)
		}
	})

	t.Run("vários aparelhos: um envio para cada token", func(t *testing.T) {
		r := newRig()
		r.tokens.tokens["u-ana"] = []string{"tok-1", "tok-2"}
		r.n.OnMessage(dmEvent("oi", "u-ana"))
		expectTokens(t, r, "tok-1", "tok-2")
	})

	t.Run("token não registrado é apagado; outro erro não apaga e não derruba", func(t *testing.T) {
		r := newRig()
		r.tokens.tokens["u-ana"] = []string{"velho", "instavel", "ok"}
		r.sender.errs["velho"] = fcm.ErrUnregistered
		r.sender.errs["instavel"] = errors.New("FCM fora do ar")
		r.n.OnMessage(dmEvent("oi", "u-ana"))
		expectTokens(t, r, "velho", "instavel", "ok")
		if len(r.tokens.deleted) != 1 || r.tokens.deleted[0] != "velho" {
			t.Fatalf("apagados = %v", r.tokens.deleted)
		}
	})

	t.Run("push desligado (sem credenciais): não faz nada", func(t *testing.T) {
		r := newRig()
		r.sender.disabled = true
		r.n.OnMessage(dmEvent("oi", "u-ana"))
		expectTokens(t, r)
	})
}

func TestMencaoEmCanal(t *testing.T) {
	t.Run("@usuário offline recebe, com título 'autor em #canal' e dados do canal", func(t *testing.T) {
		r := newRig()
		r.n.OnMessage(channelEvent("oi @ana_mobile, vem ver", nil))
		expectTokens(t, r, "tok-ana")
		m := r.sender.sent[0]
		if m.Title != "Autor em #geral" || m.Body != "oi @ana_mobile, vem ver" {
			t.Fatalf("título/texto = %q / %q", m.Title, m.Body)
		}
		for k, v := range map[string]string{"type": "mention", "channel_id": "chan-1", "server_id": "srv-1", "name": "geral", "message_id": "m2"} {
			if m.Data[k] != v {
				t.Fatalf("data[%s] = %q, esperava %q", k, m.Data[k], v)
			}
		}
	})

	t.Run("encaminhada não pinga quem a original citava", func(t *testing.T) {
		r := newRig()
		ev := channelEvent("oi @ana_mobile, vem ver", nil)
		ev.Message.ForwardedFrom = &message.ForwardedFrom{MessageID: "m0", AuthorID: "u-bia"}
		r.n.OnMessage(ev)
		expectTokens(t, r)
	})

	t.Run("mensagem comum de canal não notifica ninguém", func(t *testing.T) {
		r := newRig()
		r.n.OnMessage(channelEvent("bom dia, pessoal", nil))
		expectTokens(t, r)
	})

	t.Run("quem não enxerga o canal não recebe", func(t *testing.T) {
		r := newRig()
		r.access.deny["u-ana"] = true
		r.build()
		r.n.OnMessage(channelEvent("@ana_mobile @bia_web", nil))
		expectTokens(t, r, "tok-bia")
	})

	t.Run("@all avisa todos os membros menos o autor", func(t *testing.T) {
		r := newRig()
		r.tokens.tokens["u-autor"] = []string{"tok-autor"}
		r.n.OnMessage(channelEvent("@all reunião agora", ptr("all")))
		expectTokens(t, r, "tok-ana", "tok-bia", "tok-caio")
	})

	t.Run("@here não gera push (quem recebe está online, por definição)", func(t *testing.T) {
		r := newRig()
		r.n.OnMessage(channelEvent("@here", ptr("here")))
		expectTokens(t, r)
	})

	t.Run("silenciar o @everyone corta só o @all, não a menção direta", func(t *testing.T) {
		r := newRig()
		r.settings.all["u-ana"] = notifysettings.All{Servers: map[string]notifysettings.Settings{"srv-1": {Level: notifysettings.LevelAll, SuppressEveryone: true}}}
		r.build()
		r.n.OnMessage(channelEvent("@all", ptr("all")))
		expectTokens(t, r, "tok-bia", "tok-caio")
		r.sender.sent = nil
		r.n.OnMessage(channelEvent("@all e @ana_mobile", ptr("all")))
		if got := sentTo(r); len(got) != 3 {
			t.Fatalf("com menção direta a Ana, os três recebem: %v", got)
		}
	})
}

func TestSilencioENivel(t *testing.T) {
	serverWith := func(s notifysettings.Settings) notifysettings.All {
		return notifysettings.All{Servers: map[string]notifysettings.Settings{"srv-1": s}}
	}
	future := fixedNow.Add(time.Hour)
	past := fixedNow.Add(-time.Hour)

	cases := []struct {
		name string
		all  notifysettings.All
		want bool
	}{
		{"padrão recebe", notifysettings.All{}, true},
		{"servidor silenciado", serverWith(notifysettings.Settings{Muted: true, Level: notifysettings.LevelAll}), false},
		{"silenciado até o futuro", serverWith(notifysettings.Settings{Muted: true, MutedUntil: &future, Level: notifysettings.LevelAll}), false},
		{"silêncio vencido volta a receber", serverWith(notifysettings.Settings{Muted: true, MutedUntil: &past, Level: notifysettings.LevelAll}), true},
		{"nível 'nothing' nunca", serverWith(notifysettings.Settings{Level: notifysettings.LevelNothing}), false},
		{"nível 'mentions' recebe menção", serverWith(notifysettings.Settings{Level: notifysettings.LevelMentions}), true},
		{"canal silenciado", notifysettings.All{Channels: map[string]notifysettings.Settings{"chan-1": {Muted: true, Level: notifysettings.LevelAll}}}, false},
		{"canal 'nothing' vale mais que servidor 'all'", notifysettings.All{
			Servers:  map[string]notifysettings.Settings{"srv-1": {Level: notifysettings.LevelAll}},
			Channels: map[string]notifysettings.Settings{"chan-1": {Level: notifysettings.LevelNothing}},
		}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := newRig()
			r.settings.all["u-ana"] = c.all
			r.build()
			r.n.OnMessage(channelEvent("@ana_mobile", nil))
			if got := len(r.sender.sent) == 1; got != c.want {
				t.Fatalf("recebeu = %v, esperava %v", got, c.want)
			}
		})
	}
}

func TestPedidoDeAmizade(t *testing.T) {
	requester := &user.User{ID: "u-autor", Username: "autor", DisplayName: "Autor"}

	t.Run("destinatário offline recebe com texto e dados", func(t *testing.T) {
		r := newRig()
		r.n.OnFriendRequest("u-ana", requester)
		expectTokens(t, r, "tok-ana")
		m := r.sender.sent[0]
		if m.Title != "Novo pedido de amizade" || m.Body != "Autor quer ser seu amigo" {
			t.Fatalf("título/texto = %q / %q", m.Title, m.Body)
		}
		if m.Data["type"] != "friend_request" || m.Data["username"] != "autor" {
			t.Fatalf("data = %v", m.Data)
		}
	})

	t.Run("online ou em Não perturbar não recebe", func(t *testing.T) {
		r := newRig()
		r.presence.online["u-ana"] = true
		r.presence.status["u-bia"] = "dnd"
		r.build()
		r.n.OnFriendRequest("u-ana", requester)
		r.n.OnFriendRequest("u-bia", requester)
		expectTokens(t, r)
	})

	t.Run("sem credenciais não faz nada", func(t *testing.T) {
		r := newRig()
		r.sender.disabled = true
		r.n.OnFriendRequest("u-ana", requester)
		expectTokens(t, r)
	})
}

func TestOnCallInvite(t *testing.T) {
	invite := CallInvite{CallID: "call-1", ConversationID: "cv-1", CalleeID: "u-ana", InitiatorName: "Autor"}

	t.Run("destinatário offline recebe push de chamada com canal e dados", func(t *testing.T) {
		r := newRig()
		r.n.OnCallInvite(invite)
		expectTokens(t, r, "tok-ana")
		m := r.sender.sent[0]
		if m.Title != "Autor" || m.Body != "Está te ligando" || m.Channel != "chamadas" {
			t.Fatalf("push = %+v", m)
		}
		if m.Data["type"] != "call_invite" || m.Data["call_id"] != "call-1" || m.Data["conversation_id"] != "cv-1" || m.Data["name"] != "Autor" {
			t.Fatalf("data = %v", m.Data)
		}
	})

	t.Run("online ou em Não perturbar não recebe", func(t *testing.T) {
		r := newRig()
		r.presence.online["u-ana"] = true
		r.n.OnCallInvite(invite)
		expectTokens(t, r)
	})

	t.Run("sem credenciais não faz nada", func(t *testing.T) {
		r := newRig()
		r.sender.disabled = true
		r.n.OnCallInvite(invite)
		expectTokens(t, r)
	})
}

// @all num servidor grande: preferências e tokens de todo mundo em uma
// consulta cada, e quem está online nem entra nelas.
func TestMencaoParaTodosConsultaEmLote(t *testing.T) {
	r := newRig()
	r.presence.online["u-caio"] = true
	r.build()

	r.n.OnMessage(channelEvent("@all reunião", ptr("all")))

	if got := r.settings.calls; got.single != 0 || got.batch != 1 {
		t.Fatalf("preferências: %+v, queria uma consulta em lote", got)
	}
	if got := r.tokens.calls; got.single != 0 || got.batch != 1 {
		t.Fatalf("tokens: %+v, queria uma consulta em lote", got)
	}
	if len(r.sender.sent) != 2 {
		t.Fatalf("enviados = %d, queria 2 (ana e bia; caio está online)", len(r.sender.sent))
	}
}

// Quem está online ou em "não perturbe", ou não vê o canal, nem entra na
// consulta de preferências.
func TestMencaoConsultaSoQuemPodeReceber(t *testing.T) {
	r := newRig()
	r.presence.online["u-caio"] = true
	r.presence.status["u-bia"] = "dnd"
	r.build()

	r.n.OnMessage(channelEvent("@all reunião", ptr("all")))

	if got := r.settings.calls.batchIDs; !reflect.DeepEqual(got, []string{"u-ana"}) {
		t.Fatalf("preferências consultadas para %v, queria só [u-ana]", got)
	}
}

// Falha numa consulta em lote (banco fora): ninguém recebe, nada quebra.
func TestMencaoComFalhaNoLote(t *testing.T) {
	for _, tc := range []struct {
		name string
		fail func(r *rig)
	}{
		{"preferências", func(r *rig) { r.settings.calls.err = errors.New("banco fora") }},
		{"tokens", func(r *rig) { r.tokens.calls.err = errors.New("banco fora") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := newRig()
			tc.fail(r)
			r.build()
			r.n.OnMessage(channelEvent("@all reunião", ptr("all")))
			if len(r.sender.sent) != 0 {
				t.Fatalf("enviados = %d, queria 0", len(r.sender.sent))
			}
		})
	}
}
