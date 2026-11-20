package push

import (
	"context"
	"time"

	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/notifysettings"
)

// Quem uma mensagem de canal alcança (menção pelo nome e @all) e quem, pelas
// próprias preferências, quer receber.

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
