package role

import (
	"context"

	"gin-quickstart/backend/internal/audit"
)

// AuditRecorder grava no registro de auditoria do servidor (audit.Recorder).
type AuditRecorder interface {
	Record(ctx context.Context, e audit.Event)
}

// SetAudit liga o registro de auditoria (no boot).
func (s *Service) SetAudit(r AuditRecorder) {
	s.audit = r
}

func (s *Service) record(ctx context.Context, e audit.Event) {
	if s.audit != nil {
		s.audit.Record(ctx, e)
	}
}

// recordRole grava a ação sobre o cargo; edição sem mudança não grava.
func (s *Service) recordRole(ctx context.Context, actorID string, action audit.Action, before, after Role) {
	changes := roleChanges(before, after)
	if action == audit.RoleUpdate && len(changes) == 0 {
		return
	}
	s.record(ctx, audit.Event{
		ServerID: after.ServerID, ActorID: actorID, Action: action,
		TargetType: audit.TargetRole, TargetID: after.ID, TargetName: after.Name,
		Changes: changes,
	})
}

func roleChanges(before, after Role) []audit.Change {
	changes := audit.Diff(nil, "name", before.Name, after.Name)
	changes = audit.DiffPtr(changes, "color", before.Color, after.Color)
	changes = audit.Diff(changes, "hoist", before.Hoist, after.Hoist)
	return audit.Diff(changes, "permissions", before.Permissions, after.Permissions)
}

// recordMemberRole: o cargo dado vai em "depois", o tirado em "antes".
func (s *Service) recordMemberRole(ctx context.Context, serverID, actorID, targetID string, role Role, add bool) {
	action, change := audit.MemberRoleRemove, audit.Change{Field: "role", Before: role.Name}
	if add {
		action, change = audit.MemberRoleAdd, audit.Change{Field: "role", After: role.Name}
	}
	s.record(ctx, audit.Event{
		ServerID: serverID, ActorID: actorID, Action: action,
		TargetType: audit.TargetMember, TargetID: targetID,
		Changes: []audit.Change{change},
	})
}
