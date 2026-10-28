package role

import (
	"sort"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
)

// sectionRoles: alvo do registro de reordenação de cargos.
const sectionRoles = "roles"

// roleChanges: o que mudou entre o cargo antes e depois da edição.
func roleChanges(before, after Role) []audit.Change {
	var changes []audit.Change
	changes = audit.Diff(changes, "name", before.Name, after.Name)
	changes = audit.Diff(changes, "color", before.Color, after.Color)
	changes = audit.Diff(changes, "hoist", before.Hoist, after.Hoist)
	changes = audit.Diff(changes, "permissions", permission.NamesOf(before.Permissions), permission.NamesOf(after.Permissions))
	return changes
}

// orderNames: nomes dos cargos do mais alto para o mais baixo, usando as
// posições novas de positions onde houver (nil = as atuais).
func orderNames(roles []Role, positions map[string]int) []string {
	type ranked struct {
		name string
		pos  int
	}
	list := make([]ranked, 0, len(roles))
	for _, r := range roles {
		pos := r.Position
		if p, ok := positions[r.ID]; ok {
			pos = p
		}
		list = append(list, ranked{name: r.Name, pos: pos})
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].pos > list[j].pos })
	names := make([]string, 0, len(list))
	for _, r := range list {
		names = append(names, r.name)
	}
	return names
}
