// Package audit é o registro de auditoria de cada servidor, como no Discord:
// quem fez cada ação de moderação ou administração, em quem/onde, quando e o
// que mudou. Os domínios gravam pelo Recorder (cada um declara a interface
// pequena que usa); a leitura exige VIEW_AUDIT_LOG (o dono e o Administrador
// têm). Ver docs/adr/0036-registro-de-auditoria.md.
package audit

import "time"

// Action identifica a ação. O valor vai para o banco e para a API (o app tem
// a mesma lista em features/servers/lib/auditLog.ts): não renomear.
type Action string

const (
	ServerUpdate Action = "server.update"
	BotAdd       Action = "bot.add"
	BotRemove    Action = "bot.remove"

	InviteCreate      Action = "invite.create"
	InviteReset       Action = "invite.reset"
	GuestInviteCreate Action = "guest_invite.create"
	GuestInviteDelete Action = "guest_invite.delete"
	GuestRemove       Action = "guest.remove"

	ChannelCreate          Action = "channel.create"
	ChannelUpdate          Action = "channel.update"
	ChannelDelete          Action = "channel.delete"
	ChannelReorder         Action = "channel.reorder"
	ChannelOverwriteUpdate Action = "channel.overwrite.update"
	ChannelOverwriteDelete Action = "channel.overwrite.delete"

	RoleCreate       Action = "role.create"
	RoleUpdate       Action = "role.update"
	RoleDelete       Action = "role.delete"
	RoleReorder      Action = "role.reorder"
	MemberRoleAdd    Action = "member.role.add"
	MemberRoleRemove Action = "member.role.remove"

	MemberJoin     Action = "member.join"
	MemberLeave    Action = "member.leave"
	MemberKick     Action = "member.kick"
	MemberBan      Action = "member.ban"
	MemberUnban    Action = "member.unban"
	MemberNickname Action = "member.nickname"

	VoiceMute       Action = "voice.mute"
	VoiceDeafen     Action = "voice.deafen"
	VoiceMove       Action = "voice.move"
	VoiceDisconnect Action = "voice.disconnect"

	MessageDelete Action = "message.delete"
	MessagePin    Action = "message.pin"
	MessageUnpin  Action = "message.unpin"

	EmojiCreate   Action = "emoji.create"
	EmojiDelete   Action = "emoji.delete"
	StickerCreate Action = "sticker.create"
	StickerDelete Action = "sticker.delete"
	SoundCreate   Action = "sound.create"
	SoundDelete   Action = "sound.delete"

	EventCreate Action = "event.create"
	EventUpdate Action = "event.update"
	EventDelete Action = "event.delete"
	EventAccess Action = "event.access"
)

// Actions: todas as ações conhecidas (o filtro só aceita estas).
var Actions = []Action{
	ServerUpdate, BotAdd, BotRemove,
	InviteCreate, InviteReset, GuestInviteCreate, GuestInviteDelete, GuestRemove,
	ChannelCreate, ChannelUpdate, ChannelDelete, ChannelReorder, ChannelOverwriteUpdate, ChannelOverwriteDelete,
	RoleCreate, RoleUpdate, RoleDelete, RoleReorder, MemberRoleAdd, MemberRoleRemove,
	MemberJoin, MemberLeave, MemberKick, MemberBan, MemberUnban, MemberNickname,
	VoiceMute, VoiceDeafen, VoiceMove, VoiceDisconnect,
	MessageDelete, MessagePin, MessageUnpin,
	EmojiCreate, EmojiDelete, StickerCreate, StickerDelete, SoundCreate, SoundDelete,
	EventCreate, EventUpdate, EventDelete, EventAccess,
}

// Tipos de alvo. Membro, canal e cargo sem nome têm o nome resolvido na
// gravação; o de membro é relido na consulta (fica o nome atual).
const (
	TargetServer  = "server"
	TargetMember  = "member"
	TargetChannel = "channel"
	TargetRole    = "role"
	TargetInvite  = "invite"
	TargetEmoji   = "emoji"
	TargetSticker = "sticker"
	TargetSound   = "sound"
	TargetEvent   = "event"
)

// Change é um campo que mudou: antes e depois (nil onde não se aplica).
type Change struct {
	Field  string `json:"field"`
	Before any    `json:"before,omitempty"`
	After  any    `json:"after,omitempty"`
}

// Event é o que um domínio manda gravar. ActorID vazio = o sistema.
type Event struct {
	ServerID   string
	ActorID    string
	Action     Action
	TargetType string
	TargetID   string
	// TargetName vazio: resolvido na gravação para membro, canal e cargo.
	TargetName string
	// ChannelID: onde aconteceu (mensagem, voz, permissão de canal); o nome
	// é resolvido na gravação.
	ChannelID string
	Changes   []Change
	Reason    string
}

// Entry é uma linha do registro como a API devolve.
type Entry struct {
	ID          int64     `json:"id"`
	Action      Action    `json:"action"`
	CreatedAt   time.Time `json:"created_at"`
	ActorID     string    `json:"actor_id"`
	ActorName   string    `json:"actor_name"`
	ActorAvatar *string   `json:"actor_avatar_url"`
	TargetType  string    `json:"target_type"`
	TargetID    string    `json:"target_id"`
	TargetName  string    `json:"target_name"`
	ChannelID   string    `json:"channel_id"`
	ChannelName string    `json:"channel_name"`
	Changes     []Change  `json:"changes"`
	Reason      string    `json:"reason"`
}

// Filter: ActorID e Action vazios não filtram; Before 0 começa do mais recente.
type Filter struct {
	ActorID string
	Action  Action
	Before  int64
	Limit   int
}

// Page é uma página do registro; NextBefore (nil na última) pede a próxima.
type Page struct {
	Entries    []Entry `json:"entries"`
	NextBefore *int64  `json:"next_before"`
}
