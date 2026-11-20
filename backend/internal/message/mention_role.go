package message

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"unicode"

	"gin-quickstart/backend/internal/permission"
)

// Menção de cargo num canal de servidor (ADR 0065). O texto guarda "@handle"
// (o nome do cargo em minúsculas, com "-" no lugar dos espaços) e o app manda
// junto os ids dos cargos que a pessoa escolheu. O texto sozinho não pinga
// cargo nenhum: aqui só se confere o que foi pedido.

// RoleMention é um cargo que a mensagem pingou, com o handle escrito no texto
// (fica gravado: renomear o cargo não desfaz o destaque das mensagens antigas).
type RoleMention struct {
	ID     string `json:"id"`
	Handle string `json:"handle"`
}

// maxMentionRoleIDs: quantos ids o app pode mandar numa mensagem (o servidor
// tem no máximo 50 cargos); o resto é ignorado.
const maxMentionRoleIDs = 50

// RoleSource: os cargos de um servidor (permission.Service, do snapshot em cache).
type RoleSource interface {
	Snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error)
}

// SetRoleSource liga a menção de cargo (no boot). Sem ela, cargo é texto puro.
func (s *Service) SetRoleSource(roles RoleSource) { s.roles = roles }

// RoleHandle é como o cargo se escreve numa menção: minúsculas, espaços e "-"
// viram um "-" só (nunca nas pontas) e o que não é letra, dígito ou "_" some.
// "" = o nome não dá handle (só símbolos ou emoji). Mesma regra do app
// (features/chat/lib/roleMentions.ts); os casos de testdata/role_mentions.json
// rodam nos dois lados.
func RoleHandle(name string) string {
	var out strings.Builder
	gap := false
	for _, r := range strings.ToLower(name) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_':
			if gap && out.Len() > 0 {
				out.WriteByte('-')
			}
			gap = false
			out.WriteRune(r)
		case unicode.IsSpace(r) || r == '-':
			gap = true
		}
	}
	return out.String()
}

// reservedHandle: @all, @here e @everyone são menções em massa do canal; um
// cargo com esse nome não toma o lugar delas.
func reservedHandle(handle string) bool {
	return handle == MentionAll || handle == MentionHere || handle == mentionEveryoneAlias
}

// mentionsHandle: o texto tem "@handle" como palavra inteira, fora de código?
func mentionsHandle(content string, handle string) bool {
	return handle != "" && mentionsWord(strings.ToLower(StripCode(content)), handle)
}

// mentionableBy: o cargo pode ser mencionado por este autor? Os fixos
// (@everyone e Bots) nunca; os outros, se o cargo é aberto ou o autor tem
// MENTION_EVERYONE no canal.
func mentionableBy(role permission.Role, canMentionAny bool) bool {
	return !role.IsDefault && !role.IsSystem && (role.Mentionable || canMentionAny)
}

// roleMentions devolve, dos ids pedidos pelo app, os cargos que a mensagem
// pinga: cargo do servidor, mencionável pelo autor e com o handle no texto.
// O que não passa é ignorado (a mensagem sai, só não pinga). Um handle tem um
// significado só por mensagem: com dois cargos de mesmo handle, vale o
// primeiro pedido.
func roleMentions(content string, ids []string, roles map[string]permission.Role, canMentionAny bool) []RoleMention {
	if len(ids) > maxMentionRoleIDs {
		ids = ids[:maxMentionRoleIDs]
	}
	lower := strings.ToLower(StripCode(content))
	var out []RoleMention
	used := map[string]bool{}
	for _, id := range ids {
		role, ok := roles[id]
		if !ok || !mentionableBy(role, canMentionAny) {
			continue
		}
		handle := RoleHandle(role.Name)
		if !pingableHandle(handle, used) || !mentionsWord(lower, handle) {
			continue
		}
		used[handle] = true
		out = append(out, RoleMention{ID: role.ID, Handle: handle})
	}
	return out
}

// pingableHandle: o handle existe, não é de menção em massa e ainda não foi
// usado por outro cargo nesta mensagem.
func pingableHandle(handle string, used map[string]bool) bool {
	return handle != "" && !reservedHandle(handle) && !used[handle]
}

// requestedRoleMentions lê os cargos do servidor e valida os ids pedidos. Sem
// ids não consulta nada; falha ao ler os cargos não pinga (e não derruba a
// mensagem).
func (s *Service) requestedRoleMentions(ctx context.Context, serverID string, content string, ids []string, canMentionAny bool) []RoleMention {
	if len(ids) == 0 || s.roles == nil {
		return nil
	}
	snap, err := s.roles.Snapshot(ctx, serverID)
	if err != nil {
		log.Printf("mention_roles: falha ao ler os cargos de %s: %v", serverID, err)
		return nil
	}
	return roleMentions(content, ids, snap.Roles, canMentionAny)
}

// editedMentionRoles decide o mention_roles depois de uma edição. Como no
// @all, editar nunca pinga: só sai da lista o cargo cujo "@handle" sumiu do
// texto (o destaque some junto). Sem cargo sobrando, nil.
func editedMentionRoles(original []RoleMention, content string) []RoleMention {
	var kept []RoleMention
	for _, m := range original {
		if mentionsHandle(content, m.Handle) {
			kept = append(kept, m)
		}
	}
	return kept
}

// mentionRolesJSON é o valor da coluna mention_roles (NULL = não pinga cargo).
func mentionRolesJSON(roles []RoleMention) []byte {
	if len(roles) == 0 {
		return nil
	}
	raw, _ := json.Marshal(roles)
	return raw
}

// parseMentionRoles lê a coluna mention_roles; vazio ou inválido = nenhum.
func parseMentionRoles(raw []byte) []RoleMention {
	if len(raw) == 0 {
		return nil
	}
	var roles []RoleMention
	if err := json.Unmarshal(raw, &roles); err != nil || len(roles) == 0 {
		return nil
	}
	return roles
}

// StripRoleMentions tira do texto os "@handle" dos cargos que a mensagem
// pingou (cada um vira um espaço). Quem procura @nick depois disso não
// confunde o cargo com uma pessoa de mesmo nome: um "@handle" tem um
// significado só por mensagem (ADR 0065).
func StripRoleMentions(content string, roles []RoleMention) string {
	if len(roles) == 0 {
		return content
	}
	lower := strings.ToLower(content)
	if len(lower) != len(content) {
		// Minúscula que muda de tamanho: segue pelo texto em minúsculas, para
		// os índices das duas cópias baterem.
		content = lower
	}
	for _, role := range roles {
		content, lower = cutWord(content, lower, role.Handle)
	}
	return content
}

// cutWord troca cada "@word" inteiro por um espaço em text e na cópia em
// minúsculas (as duas têm os mesmos índices).
func cutWord(text string, lower string, word string) (string, string) {
	if word == "" {
		return text, lower
	}
	needle := "@" + word
	for from := 0; from < len(lower); {
		i := strings.Index(lower[from:], needle)
		if i < 0 {
			break
		}
		at := from + i
		end := at + len(needle)
		if opensToken(lower[:at]) && tokenEndsAt(lower, end) {
			text = text[:at] + " " + text[end:]
			lower = lower[:at] + " " + lower[end:]
		}
		from = at + 1
	}
	return text, lower
}
