package permission

import "time"

// Role é um cargo do servidor. O @everyone (IsDefault) tem posição 0 e vale
// para todo membro; os demais somam permissões por cima dele.
type Role struct {
	ID          string    `json:"id"`
	ServerID    string    `json:"server_id"`
	Name        string    `json:"name"`
	Color       *int      `json:"color"`
	Position    int       `json:"position"`
	Permissions int64     `json:"permissions"`
	Hoist       bool      `json:"hoist"`
	IsDefault   bool      `json:"is_default"`
	IsSystem    bool      `json:"is_system"`
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

// Base: permissões do membro no servidor, sem olhar canal. Dono e quem tem
// ADMINISTRATOR ficam com tudo.
func Base(ownerID, userID string, everyone int64, roles []Role) int64 {
	if userID != "" && userID == ownerID {
		return All
	}
	perms := everyone
	for _, r := range roles {
		perms |= r.Permissions
	}
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
	hasRole := make(map[string]bool, len(roleIDs))
	for _, id := range roleIDs {
		hasRole[id] = true
	}

	for _, o := range overwrites {
		if o.TargetType == TargetRole && o.TargetID == everyoneRoleID {
			perms &^= o.Deny
			perms |= o.Allow
		}
	}

	var allow, deny int64
	for _, o := range overwrites {
		if o.TargetType == TargetRole && o.TargetID != everyoneRoleID && hasRole[o.TargetID] {
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

// implicit: sem ver o canal não faz nada nele; em texto, sem enviar não anexa
// nem menciona todos; em voz, sem conectar não fala, transmite nem modera.
func implicit(perms int64, channelType string) int64 {
	if perms&ViewChannel == 0 {
		return 0
	}
	switch channelType {
	case ChannelText:
		if perms&SendMessages == 0 {
			perms &^= AttachFiles | MentionEveryone
		}
	case ChannelVoice:
		if perms&Connect == 0 {
			perms &^= Speak | Stream | MuteMembers | DeafenMembers | MoveMembers | UseSoundboard
		}
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

// CanActOn: o ator pode expulsar, banir, silenciar, mover ou trocar os cargos
// do alvo? O dono nunca é alvo; ninguém age sobre si mesmo; fora o dono, só
// quem tem cargo mais alto que o do alvo.
func CanActOn(ownerID, actorID, targetID string, actorHighest, targetHighest int) bool {
	if targetID == ownerID || actorID == targetID {
		return false
	}
	if actorID == ownerID {
		return true
	}
	return actorHighest > targetHighest
}
