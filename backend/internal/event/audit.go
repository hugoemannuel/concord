package event

import (
	"context"
	"time"

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

func eventEvent(action audit.Action, actorID string, e *Event, changes []audit.Change) audit.Event {
	return audit.Event{
		ServerID: e.ServerID, ActorID: actorID, Action: action,
		TargetType: audit.TargetEvent, TargetID: e.ID, TargetName: e.Title,
		Changes: changes,
	}
}

// recordChange grava a criação ou a edição (after nil = a edição falhou; sem
// mudança, não grava).
func (s *Service) recordChange(ctx context.Context, action audit.Action, actorID string, before Event, after *Event) {
	if after == nil {
		return
	}
	changes := eventChanges(before, *after)
	if len(changes) > 0 {
		s.record(ctx, eventEvent(action, actorID, after, changes))
	}
}

func eventChanges(before, after Event) []audit.Change {
	changes := audit.Diff(nil, "title", before.Title, after.Title)
	changes = audit.Diff(changes, "description", before.Description, after.Description)
	changes = audit.Diff(changes, "starts_at", isoTime(before.StartsAt), isoTime(after.StartsAt))
	changes = audit.Diff(changes, "duration_minutes", before.DurationMinutes, after.DurationMinutes)
	return audit.Diff(changes, "recurrence", string(before.Recurrence), string(after.Recurrence))
}

func isoTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}
