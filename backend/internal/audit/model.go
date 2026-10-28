// Package audit guarda o registro de auditoria de cada servidor: quem fez
// cada ação administrativa, em qual alvo e o que mudou. Alterações no banco
// gravam o registro na mesma transação (Tx); a voz, que mexe em estado de
// memória e no LiveKit, grava depois que a ação aconteceu (Recorder).
package audit

// Action identifica a ação. O valor vai para o banco e para a API: não mudar.
type Action string

const (
	ChannelCreate          Action = "channel.create"
	ChannelUpdate          Action = "channel.update"
	ChannelDelete          Action = "channel.delete"
	ChannelReorder         Action = "channel.reorder"
	ChannelOverwriteSet    Action = "channel.overwrite.set"
	ChannelOverwriteDelete Action = "channel.overwrite.delete"

	RoleCreate       Action = "role.create"
	RoleUpdate       Action = "role.update"
	RoleDelete       Action = "role.delete"
	RoleReorder      Action = "role.reorder"
	RoleMemberAdd    Action = "role.member.add"
	RoleMemberRemove Action = "role.member.remove"

	ServerUpdate          Action = "server.update"
	ServerIconUpdate      Action = "server.icon.update"
	ServerIconRemove      Action = "server.icon.remove"
	ServerPrimaryChannel  Action = "server.primary_channel.update"
	ServerInviteCodeReset Action = "server.invite_code.reset"

	MemberJoin     Action = "member.join"
	MemberLeave    Action = "member.leave"
	MemberKick     Action = "member.kick"
	MemberBan      Action = "member.ban"
	MemberUnban    Action = "member.unban"
	MemberNickname Action = "member.nickname.update"

	VoiceServerMute   Action = "voice.server_mute"
	VoiceServerDeafen Action = "voice.server_deafen"
	VoiceMove         Action = "voice.move"
	VoiceDisconnect   Action = "voice.disconnect"
)

// Actions: todas as ações registradas. Filtro e validação usam esta lista; o
// app tem a mesma (frontend/.../servers/lib/auditLog.ts).
var Actions = []Action{
	ChannelCreate, ChannelUpdate, ChannelDelete, ChannelReorder, ChannelOverwriteSet, ChannelOverwriteDelete,
	RoleCreate, RoleUpdate, RoleDelete, RoleReorder, RoleMemberAdd, RoleMemberRemove,
	ServerUpdate, ServerIconUpdate, ServerIconRemove, ServerPrimaryChannel, ServerInviteCodeReset,
	MemberJoin, MemberLeave, MemberKick, MemberBan, MemberUnban, MemberNickname,
	VoiceServerMute, VoiceServerDeafen, VoiceMove, VoiceDisconnect,
}

// Resultado: "ok" quando a ação foi feita por inteiro; "partial" quando parte
// dela aconteceu (ex.: a pessoa saiu do canal de voz, mas não entrou no destino).
const (
	ResultOK      = "ok"
	ResultPartial = "partial"
)

// Tipos de alvo. Membro: target_id é o id do usuário e o nome vem da tabela de
// usuários na consulta (sempre atual). Os demais guardam o nome na hora.
const (
	TargetChannel = "channel"
	TargetRole    = "role"
	TargetMember  = "member"
	TargetServer  = "server"
	TargetSection = "section"
)

// Change é uma mudança: campo, valor antes e valor depois (nil onde não se aplica).
type Change struct {
	Field  string `json:"field"`
	Before any    `json:"before"`
	After  any    `json:"after"`
}

// Event é um registro pronto para gravar.
type Event struct {
	ServerID   string
	ActorID    string
	Action     Action
	TargetType string
	TargetID   string
	TargetName string
	Changes    []Change
	Result     string
	Reason     string
}

// Mark diz quem faz a alteração e qual é a ação. O repositório que grava a
// mudança completa o alvo e as mudanças dentro da própria transação. nil
// significa que a alteração não é registrada (ex.: canais de sistema).
type Mark struct {
	ServerID string
	ActorID  string
	Action   Action
	Reason   string
}

// Event monta o registro a partir da marca; nil se não há marca.
func (m *Mark) Event(targetType, targetID, targetName string, changes []Change) *Event {
	if m == nil {
		return nil
	}
	return &Event{
		ServerID:   m.ServerID,
		ActorID:    m.ActorID,
		Action:     m.Action,
		TargetType: targetType,
		TargetID:   targetID,
		TargetName: targetName,
		Changes:    changes,
		Result:     ResultOK,
		Reason:     m.Reason,
	}
}
