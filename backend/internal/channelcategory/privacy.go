package channelcategory

import (
	"errors"

	"gin-quickstart/backend/internal/permission"
)

// Os nomes das categorias que todo servidor novo ganha (e a migration 000194 usa).
const (
	DefaultTextCategory  = "Canais de texto"
	DefaultVoiceCategory = "Canais de voz"
)

var (
	// ErrInvalidTarget: cargo ou membro que não é deste servidor.
	ErrInvalidTarget = errors.New("cargo ou membro não encontrado neste servidor")
	// ErrCannotGrant: o ator tentou mexer em bits que não tem.
	ErrCannotGrant = errors.New("você não pode liberar ou negar uma permissão que não tem")
	// ErrInvalidOverwrite: o mesmo bit liberado e negado.
	ErrInvalidOverwrite = errors.New("uma permissão não pode ser liberada e negada ao mesmo tempo")
	// ErrFixedChannel: canal de sistema ou de evento não recebe regras de categoria.
	ErrFixedChannel = errors.New("este canal não recebe as permissões da categoria")
	// ErrNoCategory: o canal está solto, não tem com quem sincronizar.
	ErrNoCategory = errors.New("o canal não está em nenhuma categoria")
)

// accessBits: o que ser escolhido numa categoria privada dá. Conectar vai junto para
// os canais de voz dela funcionarem (em canal de texto o bit não faz nada).
const accessBits = permission.ViewChannel | permission.Connect

// PrivacyInput: a opção "Categoria privada" e quem foi escolhido nela.
type PrivacyInput struct {
	Private   bool     `json:"private"`
	RoleIDs   []string `json:"role_ids"`
	MemberIDs []string `json:"member_ids"`
}

func (in PrivacyInput) validate(snap *permission.Snapshot) error {
	for _, id := range in.RoleIDs {
		if role, ok := snap.Roles[id]; !ok || role.IsDefault {
			return ErrInvalidTarget
		}
	}
	for _, id := range in.MemberIDs {
		if !snap.IsMember(id) {
			return ErrInvalidTarget
		}
	}
	return nil
}

// privacyOverwrites aplica a opção por cima das regras atuais, sem mexer no que não é
// acesso (ex.: negar enviar mensagens para um cargo). Quem está mudando continua
// vendo, mesmo sem nenhum cargo escolhido.
func privacyOverwrites(snap *permission.Snapshot, actor string, in PrivacyInput, current []permission.Overwrite) []permission.Overwrite {
	access := accessBits & snap.Server(actor)
	rules := currentRules(current)
	everyone := target{permission.TargetRole, snap.Everyone.ID}
	if in.Private {
		rule := rules[everyone]
		rule.Deny |= permission.ViewChannel
		rule.Allow &^= permission.ViewChannel
		rules[everyone] = rule
	} else {
		rule := rules[everyone]
		rule.Deny &^= permission.ViewChannel
		rules[everyone] = rule
	}
	for key, rule := range rules {
		if key != everyone {
			rule.Allow &^= accessBits
			rules[key] = rule
		}
	}
	if in.Private {
		grant(rules, permission.TargetRole, in.RoleIDs, access)
		grant(rules, permission.TargetMember, in.MemberIDs, access)
		keepActorAccess(snap, actor, rules, access)
	}
	return rulesToRows(rules)
}

type target struct{ kind, id string }

func currentRules(rows []permission.Overwrite) map[target]permission.Overwrite {
	rules := make(map[target]permission.Overwrite, len(rows))
	for _, row := range rows {
		rules[target{row.TargetType, row.TargetID}] = row
	}
	return rules
}

func grant(rules map[target]permission.Overwrite, kind string, ids []string, access int64) {
	for _, id := range ids {
		rule := rules[target{kind, id}]
		rule.Allow |= access
		rule.Deny &^= access
		rules[target{kind, id}] = rule
	}
}

func keepActorAccess(snap *permission.Snapshot, actor string, rules map[target]permission.Overwrite, access int64) {
	perms := permission.ForChannel(snap.Server(actor), permission.ChannelText, rulesToRows(rules), snap.Everyone.ID, actor, snap.MemberRoles[actor])
	if perms&permission.ViewChannel == 0 {
		grant(rules, permission.TargetMember, []string{actor}, access)
	}
}

func rulesToRows(rules map[target]permission.Overwrite) []permission.Overwrite {
	rows := make([]permission.Overwrite, 0, len(rules))
	for key, rule := range rules {
		if rule.Allow == 0 && rule.Deny == 0 {
			continue
		}
		rule.TargetType, rule.TargetID = key.kind, key.id
		rows = append(rows, rule)
	}
	return rows
}

// isPrivate: o @everyone não vê (é isso que a opção "Categoria privada" liga).
func isPrivate(rows []permission.Overwrite, everyone string) bool {
	return currentRules(rows)[target{permission.TargetRole, everyone}].Deny&permission.ViewChannel != 0
}

// changedBits: os bits que diferem entre as duas listas, em qualquer alvo.
func changedBits(before, after []permission.Overwrite) int64 {
	left, right := currentRules(before), currentRules(after)
	var changed int64
	for key, rule := range left {
		changed |= (rule.Allow ^ right[key].Allow) | (rule.Deny ^ right[key].Deny)
	}
	for key, rule := range right {
		if _, known := left[key]; !known {
			changed |= rule.Allow | rule.Deny
		}
	}
	return changed
}

// withOverwrite troca (next != nil) ou tira a regra de um alvo.
func withOverwrite(rows []permission.Overwrite, kind, id string, next *permission.Overwrite) []permission.Overwrite {
	rules := currentRules(rows)
	key := target{kind, id}
	delete(rules, key)
	if next != nil {
		rules[key] = *next
	}
	return rulesToRows(rules)
}

func validTarget(snap *permission.Snapshot, kind, id string) bool {
	switch kind {
	case permission.TargetRole:
		_, ok := snap.Roles[id]
		return ok
	case permission.TargetMember:
		return snap.IsMember(id)
	}
	return false
}
