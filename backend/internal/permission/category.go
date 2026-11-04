package permission

// CategoryInfo: o que o cálculo precisa de uma categoria de canais.
type CategoryInfo struct {
	ID         string
	Overwrites []Overwrite
}

// WithCategory põe a categoria no snapshot montado à mão (testes e fakes).
func (s *Snapshot) WithCategory(id string, overwrites ...Overwrite) *Snapshot {
	if s.Categories == nil {
		s.Categories = map[string]CategoryInfo{}
	}
	s.Categories[id] = CategoryInfo{ID: id, Overwrites: overwrites}
	return s
}

// InCategory põe o canal na categoria no snapshot montado à mão.
func (s *Snapshot) InCategory(channelID, categoryID string) *Snapshot {
	info := s.Channels[channelID]
	info.CategoryID = categoryID
	s.Channels[channelID] = info
	return s
}

// CanViewCategory: o membro enxerga a categoria (a mesma conta de um canal).
// Categoria desconhecida e quem não é membro não veem.
func (s *Snapshot) CanViewCategory(categoryID string, userID string) bool {
	category, ok := s.Categories[categoryID]
	if !ok || !s.IsMember(userID) {
		return false
	}
	if len(category.Overwrites) == 0 {
		return true
	}
	perms := ForChannel(s.Server(userID), ChannelText, category.Overwrites, s.Everyone.ID, userID, s.MemberRoles[userID])
	return perms&ViewChannel != 0
}

// passesCategory: o canal está fora de categoria ou o membro vê a dele. É o que
// faz a categoria privada valer para todo canal dela, até o de permissão própria.
func (s *Snapshot) passesCategory(ch ChannelInfo, userID string) bool {
	return ch.CategoryID == "" || s.CanViewCategory(ch.CategoryID, userID)
}

// SameOverwrites: as duas listas dão as mesmas regras (sem olhar a ordem, a quem
// pertencem nem as regras vazias). Canal vinculado é o que tem as mesmas da categoria.
func SameOverwrites(a, b []Overwrite) bool {
	left, right := overwriteRules(a), overwriteRules(b)
	if len(left) != len(right) {
		return false
	}
	for target, rule := range left {
		if right[target] != rule {
			return false
		}
	}
	return true
}

type overwriteTarget struct{ kind, id string }
type overwriteRule struct{ allow, deny int64 }

func overwriteRules(rows []Overwrite) map[overwriteTarget]overwriteRule {
	rules := make(map[overwriteTarget]overwriteRule, len(rows))
	for _, row := range rows {
		if row.Allow != 0 || row.Deny != 0 {
			rules[overwriteTarget{row.TargetType, row.TargetID}] = overwriteRule{row.Allow, row.Deny}
		}
	}
	return rules
}

// RestrictsView: alguma regra nega ver (a lista não deixa todo mundo entrar).
func RestrictsView(rows []Overwrite) bool {
	for _, row := range rows {
		if row.Deny&ViewChannel != 0 {
			return true
		}
	}
	return false
}

// SealOverwrites devolve as regras de um canal de permissão própria que está
// saindo da categoria. Dentro dela, só via o canal quem passava nas duas listas;
// fora, sobra só a do canal. Para ninguém ganhar acesso na saída, a restrição da
// categoria passa para o canal: errar aqui é sempre tirar acesso, nunca dar.
func SealOverwrites(channel, category []Overwrite, everyoneRoleID string) []Overwrite {
	if !RestrictsView(category) {
		return channel
	}
	sealed := overwriteRules(channel)
	restricted := RestrictsView(channel)
	closed := overwriteRules(category)[overwriteTarget{TargetRole, everyoneRoleID}].deny&ViewChannel != 0
	keepOnlyAllowedByCategory(sealed, category)
	for _, row := range category {
		target := overwriteTarget{row.TargetType, row.TargetID}
		rule := sealed[target]
		if row.Deny&ViewChannel != 0 {
			rule.deny |= ViewChannel
			rule.allow &^= ViewChannel
		} else if closed && !restricted && row.Allow&ViewChannel != 0 {
			rule.allow |= row.Allow
			rule.deny &^= row.Allow
		} else {
			continue
		}
		sealed[target] = rule
	}
	return overwriteRows(sealed)
}

// keepOnlyAllowedByCategory: liberar ver só continua valendo para quem a categoria
// também libera. Sem isso, o "liberar" de um cargo venceria o "negar" que veio da
// categoria (no mesmo nível, entre cargos, liberar ganha).
func keepOnlyAllowedByCategory(rules map[overwriteTarget]overwriteRule, category []Overwrite) {
	allowed := overwriteRules(category)
	for target, rule := range rules {
		if allowed[target].allow&ViewChannel == 0 {
			rule.allow &^= ViewChannel
			rules[target] = rule
		}
	}
}

func overwriteRows(rules map[overwriteTarget]overwriteRule) []Overwrite {
	rows := make([]Overwrite, 0, len(rules))
	for target, rule := range rules {
		if rule.allow != 0 || rule.deny != 0 {
			rows = append(rows, Overwrite{TargetType: target.kind, TargetID: target.id, Allow: rule.allow, Deny: rule.deny})
		}
	}
	return rows
}
