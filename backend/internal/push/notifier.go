package push

import (
	"context"
	"errors"
	"log"
	"sort"
	"time"

	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/notifysettings"
	"gin-quickstart/backend/internal/platform/fcm"
	"gin-quickstart/backend/internal/user"
)

// Interfaces pequenas, declaradas aqui (quem consome): o Hub, o notifysettings, o banco e o FCM entram por elas.
type Presence interface {
	// IsAppOpen: o app do celular está aberto (aí não precisa de push; o desktop não conta).
	IsAppOpen(userID string) bool
	EffectiveStatus(userID string) string
}

type SettingsSource interface {
	All(ctx context.Context, userID string) (notifysettings.All, error)
	// AllFor: as preferências de várias pessoas numa consulta (menção em canal).
	AllFor(ctx context.Context, userIDs []string) (map[string]notifysettings.All, error)
}

type Directory interface {
	ChannelName(ctx context.Context, channelID string) (string, error)
	ConversationName(ctx context.Context, conversationID string) (name string, group bool, err error)
	ServerMemberIDs(ctx context.Context, serverID string) ([]string, error)
	MemberIDsByUsername(ctx context.Context, serverID string, usernames []string) ([]string, error)
}

type ChannelAccess interface {
	CanView(ctx context.Context, channelID, userID string) bool
}

type TokenStore interface {
	TokensForUser(ctx context.Context, userID string) ([]string, error)
	TokensForUsers(ctx context.Context, userIDs []string) (map[string][]string, error)
	Delete(ctx context.Context, token string) error
}

type Sender interface {
	Enabled() bool
	Send(ctx context.Context, m fcm.Message) error
}

// Deps junta o que o Notifier usa. Run roda o envio fora do caminho da requisição (padrão: goroutine);
// os testes passam um Run síncrono.
type Deps struct {
	Presence  Presence
	Settings  SettingsSource
	Directory Directory
	Access    ChannelAccess
	Tokens    TokenStore
	Sender    Sender
	Run       func(func())
	Now       func() time.Time
}

// Notifier decide quem recebe push (DM, @menção em canal, pedido de amizade) e envia.
type Notifier struct{ Deps }

const sendTimeout = 20 * time.Second

func NewNotifier(d Deps) *Notifier {
	if d.Run == nil {
		d.Run = func(f func()) { go f() }
	}
	if d.Now == nil {
		d.Now = time.Now
	}
	return &Notifier{d}
}

// OnMessage trata uma mensagem nova: DM/grupo para os outros participantes, canal só para menções.
func (n *Notifier) OnMessage(ev message.CreateEvent) {
	if !n.Sender.Enabled() || ev.Message.SystemKind != nil {
		return
	}
	n.Run(func() {
		ctx, cancel := context.WithTimeout(context.Background(), sendTimeout)
		defer cancel()
		switch {
		case ev.ConversationID != nil:
			n.directMessage(ctx, ev)
		case ev.ChannelID != nil:
			n.channelMention(ctx, ev)
		}
	})
}

// OnFriendRequest avisa quem recebeu um pedido de amizade.
func (n *Notifier) OnFriendRequest(recipientID string, requester *user.User) {
	if !n.Sender.Enabled() || requester == nil {
		return
	}
	n.Run(func() {
		ctx, cancel := context.WithTimeout(context.Background(), sendTimeout)
		defer cancel()
		n.deliver(ctx, recipientID, fcm.Message{
			Title: "Novo pedido de amizade",
			Body:  requester.DisplayName + " quer ser seu amigo",
			Data:  map[string]string{"type": "friend_request", "username": requester.Username},
		})
	})
}

// CallInvite é uma chamada de DM que acabou de começar a tocar (vem do internal/call pelo wiring).
type CallInvite struct {
	CallID         string
	ConversationID string
	CalleeID       string
	InitiatorName  string
}

// callChannel é o canal Android das chamadas, separado do das mensagens (o app o cria).
const callChannel = "chamadas"

// OnCallInvite avisa quem está sendo chamado numa DM e não está com o app aberto.
func (n *Notifier) OnCallInvite(invite CallInvite) {
	if !n.Sender.Enabled() {
		return
	}
	n.Run(func() {
		ctx, cancel := context.WithTimeout(context.Background(), sendTimeout)
		defer cancel()
		n.deliver(ctx, invite.CalleeID, fcm.Message{
			Title:   invite.InitiatorName,
			Body:    "Está te ligando",
			Channel: callChannel,
			Data: map[string]string{
				"type": "call_invite", "call_id": invite.CallID, "conversation_id": invite.ConversationID, "name": invite.InitiatorName,
			},
		})
	})
}

func authorName(m message.Message) string {
	if m.Author != nil {
		return m.Author.DisplayName
	}
	return "Alguém"
}

func hasMedia(m message.Message) bool {
	return len(m.Attachments) > 0 || m.StickerID != nil || m.GifURL != nil
}

// directMessage: só vai ao banco (nome da conversa, tokens) se alguém dos
// outros participantes pode receber push agora.
func (n *Notifier) directMessage(ctx context.Context, ev message.CreateEvent) {
	recipients := n.pushableRecipients(ev.UserIDs, ev.Message.AuthorID)
	if len(recipients) == 0 {
		return
	}
	conversationID := *ev.ConversationID
	name, group, err := n.Directory.ConversationName(ctx, conversationID)
	if err != nil {
		log.Printf("[push] conversa %s: %v", conversationID, err)
		return
	}
	author := authorName(ev.Message)
	title, header, kind := author, author, "dm"
	if group {
		kind, header = "group", name
		if header == "" {
			header = "Grupo"
		}
		title = author + " · " + header
	}
	msg := fcm.Message{
		Title: title,
		Body:  Preview(ev.Message.Content, hasMedia(ev.Message)),
		Data: map[string]string{
			"type": "dm", "conversation_id": conversationID, "conversation_type": kind,
			"name": header, "message_id": ev.Message.ID,
		},
	}
	n.deliverAll(ctx, recipients, msg)
}

// pushableRecipients: os participantes, menos o autor, que podem receber push agora.
func (n *Notifier) pushableRecipients(userIDs []string, authorID string) []string {
	var out []string
	for _, id := range userIDs {
		if id != authorID && n.pushable(id) {
			out = append(out, id)
		}
	}
	return out
}

// channelMention: mensagem comum de canal não notifica; só quem foi citado (@usuário) ou o @all.
func (n *Notifier) channelMention(ctx context.Context, ev message.CreateEvent) {
	direct, everyone, err := n.mentionTargets(ctx, ev)
	if err != nil {
		log.Printf("[push] menções de %s: %v", ev.Message.ID, err)
		return
	}
	if len(direct)+len(everyone) == 0 {
		return
	}
	channelID := *ev.ChannelID
	channelName, err := n.Directory.ChannelName(ctx, channelID)
	if err != nil {
		log.Printf("[push] canal %s: %v", channelID, err)
		return
	}
	msg := fcm.Message{
		Title: authorName(ev.Message) + " em #" + channelName,
		Body:  Preview(ev.Message.Content, hasMedia(ev.Message)),
		Data: map[string]string{
			"type": "mention", "channel_id": channelID, "server_id": ev.ServerID,
			"name": channelName, "message_id": ev.Message.ID,
		},
	}
	targets := mergeTargets(direct, everyone, ev.Message.AuthorID)
	ids := n.reachable(ctx, channelID, targets)
	if len(ids) == 0 {
		return
	}
	// Num @all, uma consulta de preferências e uma de tokens para todos.
	settings, err := n.Settings.AllFor(ctx, ids)
	if err != nil {
		log.Printf("[push] preferências da menção %s: %v", ev.Message.ID, err)
		return
	}
	var send []string
	for _, id := range ids {
		if allowed(settings[id], ev.ServerID, channelID, targets[id], n.Now()) {
			send = append(send, id)
		}
	}
	n.deliverAll(ctx, send, msg)
}

// reachable: dos alvos, quem vê o canal e pode receber push agora (offline
// e fora do "não perturbe"), em ordem estável. Só memória e o cache de
// permissões: o banco fica para quem sobra.
func (n *Notifier) reachable(ctx context.Context, channelID string, targets map[string]bool) []string {
	ids := make([]string, 0, len(targets))
	for id := range targets {
		if n.pushable(id) && n.Access.CanView(ctx, channelID, id) {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids) // ordem estável: o envio não depende da ordem do mapa
	return ids
}

// mentionTargets separa quem foi citado pelo nome (direct) de quem só é alcançado pelo @all (everyone).
// @here não gera push: quem recebe está online, por definição. Encaminhada
// não pinga quem a original citava (o @all dela já sai nil).
func (n *Notifier) mentionTargets(ctx context.Context, ev message.CreateEvent) (direct, everyone []string, err error) {
	if names := MentionedUsernames(ev.Message.Content); len(names) > 0 && ev.Message.ForwardedFrom == nil {
		if direct, err = n.Directory.MemberIDsByUsername(ctx, ev.ServerID, names); err != nil {
			return nil, nil, err
		}
	}
	if ev.Message.MentionEveryone != nil && *ev.Message.MentionEveryone == "all" {
		if everyone, err = n.Directory.ServerMemberIDs(ctx, ev.ServerID); err != nil {
			return nil, nil, err
		}
	}
	return direct, everyone, nil
}

// mergeTargets junta as duas listas sem repetir e sem o autor; o valor diz se a pessoa foi citada pelo nome.
func mergeTargets(direct, everyone []string, authorID string) map[string]bool {
	out := map[string]bool{}
	for _, id := range everyone {
		out[id] = false
	}
	for _, id := range direct {
		out[id] = true
	}
	delete(out, authorID)
	return out
}

// allowed aplica o silêncio e o nível do notifysettings. O canal vale mais que o servidor quando define um
// nível; silenciar (canal ou servidor) corta tudo; "suprimir @everyone" corta só quem não foi citado pelo nome.
func allowed(all notifysettings.All, serverID, channelID string, direct bool, now time.Time) bool {
	server, hasServer := all.Servers[serverID]
	channel, hasChannel := all.Channels[channelID]
	for _, s := range []notifysettings.Settings{server, channel} {
		if s.Muted && (s.MutedUntil == nil || s.MutedUntil.After(now)) {
			return false
		}
	}
	level := notifysettings.LevelAll
	switch {
	case hasChannel && channel.Level != "" && channel.Level != notifysettings.LevelAll:
		level = channel.Level
	case hasServer && server.Level != "":
		level = server.Level
	}
	if level == notifysettings.LevelNothing {
		return false
	}
	return direct || !server.SuppressEveryone
}

// pushable: quem está com o app do celular aberto recebe por ele (o desktop
// não conta); "não perturbe" não recebe.
func (n *Notifier) pushable(userID string) bool {
	return !n.Presence.IsAppOpen(userID) && n.Presence.EffectiveStatus(userID) != "dnd"
}

// deliver manda para todos os aparelhos da pessoa, se ela não está com o app do celular aberto nem em Não perturbar.
func (n *Notifier) deliver(ctx context.Context, userID string, m fcm.Message) {
	if !n.pushable(userID) {
		return
	}
	tokens, err := n.Tokens.TokensForUser(ctx, userID)
	if err != nil {
		log.Printf("[push] tokens de %s: %v", userID, err)
		return
	}
	n.sendTo(ctx, userID, tokens, m)
}

// deliverAll: os tokens de todos numa consulta, e um envio por aparelho.
func (n *Notifier) deliverAll(ctx context.Context, userIDs []string, m fcm.Message) {
	if len(userIDs) == 0 {
		return
	}
	tokens, err := n.Tokens.TokensForUsers(ctx, userIDs)
	if err != nil {
		log.Printf("[push] tokens de %d pessoas: %v", len(userIDs), err)
		return
	}
	for _, id := range userIDs {
		n.sendTo(ctx, id, tokens[id], m)
	}
}

// sendTo manda m a cada aparelho; token que o FCM não reconhece mais é apagado.
func (n *Notifier) sendTo(ctx context.Context, userID string, tokens []string, m fcm.Message) {
	for _, token := range tokens {
		m.Token = token
		err := n.Sender.Send(ctx, m)
		switch {
		case errors.Is(err, fcm.ErrUnregistered):
			if delErr := n.Tokens.Delete(ctx, token); delErr != nil {
				log.Printf("[push] apagando token inválido: %v", delErr)
			}
		case err != nil:
			log.Printf("[push] envio para %s: %v", userID, err)
		}
	}
}
