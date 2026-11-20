package push

import (
	"context"
	"time"

	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/notifysettings"
)

// Quem uma mensagem de canal alcança (menção pelo nome e @all) e quem, pelas
// próprias preferências, quer receber.

// reach é como a mensagem alcança a pessoa. O mais forte vence: citada pelo
// nome, depois pelo cargo, depois pelo @all.
type reach int

const (
	reachEveryone reach = iota + 1
	reachRole
	reachDirect
)

// mentionTargets diz quem a mensagem alcança e como, sem o autor. @here não
// gera push: quem recebe está online, por definição. Encaminhada não pinga
// quem a original citava (o @all e os cargos dela já saem vazios).
func (n *Notifier) mentionTargets(ctx context.Context, ev message.CreateEvent) (map[string]reach, error) {
	targets := map[string]reach{}
	for _, find := range []func(context.Context, message.CreateEvent) ([]string, reach, error){
		n.everyoneTargets, n.roleTargets, n.directTargets,
	} {
		ids, how, err := find(ctx, ev)
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			if targets[id] < how {
				targets[id] = how
			}
		}
	}
	delete(targets, ev.Message.AuthorID)
	return targets, nil
}

// everyoneTargets: todo mundo do servidor, se a mensagem tem @all liberado.
func (n *Notifier) everyoneTargets(ctx context.Context, ev message.CreateEvent) ([]string, reach, error) {
	if ev.Message.MentionEveryone == nil || *ev.Message.MentionEveryone != message.MentionAll {
		return nil, reachEveryone, nil
	}
	ids, err := n.Directory.ServerMemberIDs(ctx, ev.ServerID)
	return ids, reachEveryone, err
}

// roleTargets: quem tem um dos cargos que a mensagem pingou (ADR 0065).
func (n *Notifier) roleTargets(ctx context.Context, ev message.CreateEvent) ([]string, reach, error) {
	if len(ev.Message.MentionRoles) == 0 {
		return nil, reachRole, nil
	}
	roleIDs := make([]string, 0, len(ev.Message.MentionRoles))
	for _, role := range ev.Message.MentionRoles {
		roleIDs = append(roleIDs, role.ID)
	}
	ids, err := n.Directory.RoleMemberIDs(ctx, ev.ServerID, roleIDs)
	return ids, reachRole, err
}

// directTargets: quem foi citado pelo @nick. O "@handle" de um cargo pingado
// não conta: ali é o cargo, não a pessoa de mesmo nome.
func (n *Notifier) directTargets(ctx context.Context, ev message.CreateEvent) ([]string, reach, error) {
	if ev.Message.ForwardedFrom != nil {
		return nil, reachDirect, nil
	}
	names := MentionedUsernames(message.StripRoleMentions(ev.Message.Content, ev.Message.MentionRoles))
	if len(names) == 0 {
		return nil, reachDirect, nil
	}
	ids, err := n.Directory.MemberIDsByUsername(ctx, ev.ServerID, names)
	return ids, reachDirect, err
}

// allowed aplica o silêncio e o nível do notifysettings. O canal vale mais que o servidor quando define um
// nível; silenciar (canal ou servidor) corta tudo; ignorar @all ou ignorar cargos corta só quem foi
// alcançado desse jeito (quem foi citado pelo nome recebe).
func allowed(all notifysettings.All, serverID, channelID string, how reach, now time.Time) bool {
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
	return !ignored(server, how)
}

// ignored: a pessoa pediu para não ser avisada por este tipo de menção?
func ignored(server notifysettings.Settings, how reach) bool {
	switch how {
	case reachDirect:
		return false
	case reachRole:
		return server.SuppressRoles
	}
	return server.SuppressEveryone
}
