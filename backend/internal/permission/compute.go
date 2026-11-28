package permission

import (
	"slices"
	"time"
)

// Role é um cargo do servidor. O @everyone (IsDefault) tem posição 0 e vale
// para todo membro; os demais somam permissões por cima dele.
type Role struct {
	ID          string `json:"id"`
	ServerID    string `json:"server_id"`
	Name        string `json:"name"`
	Color       *int   `json:"color"`
	Position    int    `json:"position"`
	Permissions int64  `json:"permissions"`
	Hoist       bool   `json:"hoist"`
	IsDefault   bool   `json:"is_default"`
	IsSystem    bool   `json:"is_system"`
	// Mentionable: qualquer pessoa pode mencionar este cargo no chat (ADR 0065).
	Mentionable bool      `json:"mentionable"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Overwrite libera (Allow) ou nega (Deny) bits num canal para um cargo ou um
// membro, por cima do que o servidor dá.
type Overwrite struct {
	ChannelID  string `json:"channel_id"`
	TargetType string `json:"target_type"`
	TargetID   string `json:"target_id"`
	Allow      int64  `json:"allow"`
	Deny       int64  `json:"deny"`
}

// baseFrom: permissões do membro no servidor, sem olhar canal, com os bits
// dos cargos já somados. Dono e quem tem ADMINISTRATOR ficam com tudo.
func baseFrom(ownerID, userID string, everyone, rolePerms int64) int64 {
	if userID != "" && userID == ownerID {
		return All
	}
	perms := everyone | rolePerms
	if perms&Administrator != 0 {
		return All
	}
	return Normalize(perms)
}

// ForChannel aplica as sobrescritas do canal sobre as permissões base, na
// ordem do Discord: @everyone, depois os cargos do membro (somados) e por
// último o próprio membro. Em cada etapa, deny tira e allow põe.
func ForChannel(base int64, channelType string, overwrites []Overwrite, everyoneRoleID string, userID string, roleIDs []string) int64 {
	if base&Administrator != 0 {
		return All
	}

	perms := base

	for _, o := range overwrites {
		if o.TargetType == TargetRole && o.TargetID == everyoneRoleID {
			perms &^= o.Deny
			perms |= o.Allow
		}
	}

	var allow, deny int64
	for _, o := range overwrites {
		if o.TargetType == TargetRole && o.TargetID != everyoneRoleID && slices.Contains(roleIDs, o.TargetID) {
			allow |= o.Allow
			deny |= o.Deny
		}
	}
	perms &^= deny
	perms |= allow

	for _, o := range overwrites {
		if o.TargetType == TargetMember && o.TargetID == userID {
			perms &^= o.Deny
			perms |= o.Allow
		}
	}

	return implicit(Normalize(perms), channelType)
}

// implicit: sem ver o canal não faz nada nele; sem enviar não anexa nem
// menciona todos (no texto e no chat do canal de voz); em voz, sem conectar
// não fala, transmite nem modera.
func implicit(perms int64, channelType string) int64 {
	if perms&ViewChannel == 0 {
		return 0
	}
	if perms&SendMessages == 0 {
		perms &^= AttachFiles | MentionEveryone | SendTTSMessages
	}
	if channelType == ChannelVoice && perms&Connect == 0 {
		perms &^= Speak | Stream | MuteMembers | DeafenMembers | MoveMembers | DisconnectMembers | UseSoundboard
	}
	return perms
}

// CanGrant: o ator só pode ligar ou desligar bits que ele mesmo tem (o
// ADMINISTRATOR/dono pode qualquer um). changed é o XOR entre antes e depois.
func CanGrant(actorPerms, changed int64) bool {
	if actorPerms&Administrator != 0 {
		return true
	}
	return Normalize(changed)&^actorPerms == 0
}

// HighestPosition: posição do cargo mais alto da lista (0 = só @everyone).
func HighestPosition(roles []Role) int {
	highest := 0
	for _, r := range roles {
		if r.Position > highest {
			highest = r.Position
		}
	}
	return highest
}

// CanManageRole: o dono mexe em qualquer cargo; os demais só nos que estão
// abaixo do seu cargo mais alto (mesma posição não pode).
func CanManageRole(isOwner bool, actorHighest int, role Role) bool {
	return isOwner || actorHighest > role.Position
}

// CanEditRolesOf: o ator pode dar ou tirar cargos do alvo? Os cargos do dono
// só ele mesmo mexe (em si, qualquer cargo); nos demais membros, o próprio ator
// incluso, vale só a hierarquia de cada cargo (CanManageRole).
func CanEditRolesOf(ownerID, actorID, targetID string) bool {
	return targetID != ownerID || actorID == ownerID
}

// CanActOn: o ator pode expulsar, banir ou aplicar castigo direto no alvo?
// O dono nunca é alvo; ninguém age sobre si mesmo; fora o dono, só quem tem
// cargo mais alto que o do alvo.
func CanActOn(ownerID, actorID, targetID string, actorHighest, targetHighest int) bool {
	if targetID == ownerID || actorID == targetID {
		return false
	}
	if actorID == ownerID {
		return true
	}
	return actorHighest > targetHighest
}

// CanManageNicknameOf: o ator pode mudar o apelido do alvo?
// O dono nunca é alvo (exceto por si mesmo); fora o dono, pode quem tem o mesmo cargo ou superior (actorHighest >= targetHighest).
func CanManageNicknameOf(ownerID, actorID, targetID string, actorHighest, targetHighest int) bool {
	if targetID == ownerID {
		return actorID == ownerID
	}
	if actorID == ownerID {
		return true
	}
	return actorHighest >= targetHighest
}

// CanModerateVoice: o ator pode silenciar, ensurdecer, desconectar ou mover
// o alvo em chamadas de voz? O dono como ator sempre pode; nos demais casos,
// compara sempre o cargo mais alto de cada um (actorHighest >= targetHighest),
// sem imunidade especial do dono como alvo e permitindo alternar em si mesmo.
func CanModerateVoice(ownerID, actorID string, actorHighest, targetHighest int) bool {
	if actorID == "" {
		return false
	}
	if actorID == ownerID {
		return true
	}
	return actorHighest >= targetHighest
}
