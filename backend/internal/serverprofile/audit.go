package serverprofile

import (
	"context"
	"strings"

	"gin-quickstart/backend/internal/audit"
)

func artLabel(a Art) string {
	if a.Image != "" {
		return "imagem"
	}
	return a.Preset
}

func traitsLabel(traits []Trait) string {
	parts := make([]string, 0, len(traits))
	for _, t := range traits {
		parts = append(parts, strings.TrimSpace(t.Emoji+" "+t.Text))
	}
	return strings.Join(parts, ", ")
}

func gamesLabel(games []Game) string {
	names := make([]string, 0, len(games))
	for _, g := range games {
		names = append(names, g.Name)
	}
	return strings.Join(names, ", ")
}

func themeLabel(t Theme) string {
	if t.Image != "" {
		return "imagem"
	}
	return t.Starter
}

// tagFields: nil vira vazio (sem tag).
func tagFields(t *Tag) (name, badge, color string) {
	if t == nil {
		return "", "", ""
	}
	return t.Name, t.Badge, t.Color
}

// profileChanges: o que mudou, com os nomes que o app traduz
// (features/auditlog/lib/auditDetails.ts).
func profileChanges(before, after Profile) []audit.Change {
	changes := audit.Diff(nil, "banner", artLabel(before.Banner), artLabel(after.Banner))
	changes = audit.Diff(changes, "traits", traitsLabel(before.Traits), traitsLabel(after.Traits))
	changes = audit.Diff(changes, "description", before.Description, after.Description)
	changes = audit.Diff(changes, "games", gamesLabel(before.Games), gamesLabel(after.Games))
	changes = audit.Diff(changes, "profile_private", before.Private, after.Private)
	changes = audit.Diff(changes, "strip", artLabel(before.Strip), artLabel(after.Strip))
	changes = audit.Diff(changes, "server_theme", themeLabel(before.Theme), themeLabel(after.Theme))
	beforeName, beforeBadge, beforeColor := tagFields(before.Tag)
	afterName, afterBadge, afterColor := tagFields(after.Tag)
	changes = audit.Diff(changes, "tag_name", beforeName, afterName)
	changes = audit.Diff(changes, "tag_badge", beforeBadge, afterBadge)
	return audit.Diff(changes, "tag_color", beforeColor, afterColor)
}

// recordUpdate grava a edição (sem mudança, não grava).
func (s *Service) recordUpdate(ctx context.Context, serverID, actorID, serverName string, before, after Profile) {
	changes := profileChanges(before, after)
	if s.audit == nil || len(changes) == 0 {
		return
	}
	s.audit.Record(ctx, audit.Event{
		ServerID: serverID, ActorID: actorID, Action: audit.ServerUpdate,
		TargetType: audit.TargetServer, TargetID: serverID, TargetName: serverName,
		Changes: changes,
	})
}
