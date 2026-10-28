// Package permission calcula o que cada membro pode ver e fazer num servidor,
// no modelo do Discord: permissões em bits, cargo @everyone, cargos com
// posição (hierarquia) e sobrescritas por canal.
package permission

import (
	"errors"
	"net/http"
	"sort"
)

// Bits de permissão. Todos abaixo de 1<<31 para o frontend fazer bitwise sem
// BigInt. Os números são contrato com o app (lib/permissions.ts): não mudar.
const (
	ViewChannel       int64 = 1 << 0
	ManageChannels    int64 = 1 << 1
	ManageRoles       int64 = 1 << 2
	ManageServer      int64 = 1 << 3
	CreateInvite      int64 = 1 << 4
	KickMembers       int64 = 1 << 5
	BanMembers        int64 = 1 << 6
	Administrator     int64 = 1 << 7
	SendMessages      int64 = 1 << 8
	AttachFiles       int64 = 1 << 9
	AddReactions      int64 = 1 << 10
	MentionEveryone   int64 = 1 << 11
	ManageMessages    int64 = 1 << 12
	ReadHistory       int64 = 1 << 13
	Connect           int64 = 1 << 16
	Speak             int64 = 1 << 17
	Stream            int64 = 1 << 18
	MuteMembers       int64 = 1 << 19
	DeafenMembers     int64 = 1 << 20
	MoveMembers       int64 = 1 << 21
	UseSoundboard     int64 = 1 << 22
	ManageExpressions int64 = 1 << 23
	DisconnectMembers int64 = 1 << 24
	// Apelido no servidor: o próprio (todo mundo, como no Discord) e o dos
	// outros (moderação, respeitando a hierarquia). Mesmos bits do Discord.
	ChangeNickname  int64 = 1 << 26
	ManageNicknames int64 = 1 << 27
	// Registro de auditoria do servidor (quem vê as ações administrativas).
	ViewAuditLog int64 = 1 << 28
)

// Names: nome de cada bit (o mesmo do app e de testdata/vectors.json).
var Names = map[string]int64{
	"VIEW_CHANNEL":         ViewChannel,
	"MANAGE_CHANNELS":      ManageChannels,
	"MANAGE_ROLES":         ManageRoles,
	"MANAGE_SERVER":        ManageServer,
	"CREATE_INVITE":        CreateInvite,
	"KICK_MEMBERS":         KickMembers,
	"BAN_MEMBERS":          BanMembers,
	"ADMINISTRATOR":        Administrator,
	"SEND_MESSAGES":        SendMessages,
	"ATTACH_FILES":         AttachFiles,
	"ADD_REACTIONS":        AddReactions,
	"MENTION_EVERYONE":     MentionEveryone,
	"MANAGE_MESSAGES":      ManageMessages,
	"READ_MESSAGE_HISTORY": ReadHistory,
	"CONNECT":              Connect,
	"SPEAK":                Speak,
	"STREAM":               Stream,
	"MUTE_MEMBERS":         MuteMembers,
	"DEAFEN_MEMBERS":       DeafenMembers,
	"MOVE_MEMBERS":         MoveMembers,
	"USE_SOUNDBOARD":       UseSoundboard,
	"MANAGE_EXPRESSIONS":   ManageExpressions,
	"DISCONNECT_MEMBERS":   DisconnectMembers,
	"CHANGE_NICKNAME":      ChangeNickname,
	"MANAGE_NICKNAMES":     ManageNicknames,
	"VIEW_AUDIT_LOG":       ViewAuditLog,
}

// All é a soma de todos os bits conhecidos (dono e ADMINISTRATOR).
const All = ViewChannel | ManageChannels | ManageRoles | ManageServer | CreateInvite |
	KickMembers | BanMembers | Administrator | SendMessages | AttachFiles | AddReactions |
	MentionEveryone | ManageMessages | ReadHistory | Connect | Speak | Stream |
	MuteMembers | DeafenMembers | MoveMembers | DisconnectMembers | UseSoundboard | ManageExpressions |
	ChangeNickname | ManageNicknames | ViewAuditLog

// DefaultEveryone: o que qualquer membro faz num servidor novo. Nos servidores
// que já existiam, a migration 000039 ligou o CHANGE_NICKNAME no @everyone.
const DefaultEveryone = ViewChannel | SendMessages | AttachFiles | AddReactions | ReadHistory |
	CreateInvite | Connect | Speak | Stream | UseSoundboard | ChangeNickname

// BotsRoleName é o nome fixo do cargo de sistema exclusivo para bots do servidor.
const BotsRoleName = "Bots"

// EveryoneName é o nome fixo do cargo padrão.
const EveryoneName = "@everyone"

// Tipos de canal (os mesmos de channel.TypeText/TypeVoice; repetidos aqui
// para este pacote não depender de channel).
const (
	ChannelText  = "text"
	ChannelVoice = "voice"
)

// Alvos de sobrescrita de canal.
const (
	TargetRole   = "role"
	TargetMember = "member"
)

var (
	ErrNotMember         = errors.New("you are not a member of this server")
	ErrMissingPermission = errors.New("você não tem permissão para isso")
	ErrChannelNotFound   = errors.New("channel not found")
)

// HTTPError: status e código para os erros deste pacote; ok=false se err não
// é um deles (cada handler trata o resto).
func HTTPError(err error) (status int, code string, ok bool) {
	switch {
	case errors.Is(err, ErrMissingPermission):
		return http.StatusForbidden, "missing_permission", true
	case errors.Is(err, ErrNotMember):
		return http.StatusForbidden, "not_member", true
	case errors.Is(err, ErrChannelNotFound):
		return http.StatusNotFound, "channel_not_found", true
	}
	return 0, "", false
}

// Has: perms tem todos os bits de want.
func Has(perms, want int64) bool {
	return perms&want == want
}

// Normalize descarta bits desconhecidos (o app pode mandar lixo).
func Normalize(perms int64) int64 {
	return perms & All
}

// NamesOf devolve os nomes das permissões em bits, na ordem dos bits (o
// registro de auditoria guarda essas listas antes e depois de uma mudança).
func NamesOf(bits int64) []string {
	type named struct {
		bit  int64
		name string
	}
	list := []named{}
	for name, bit := range Names {
		if bits&bit != 0 {
			list = append(list, named{bit, name})
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].bit < list[j].bit })
	names := make([]string, 0, len(list))
	for _, n := range list {
		names = append(names, n.name)
	}
	return names
}
