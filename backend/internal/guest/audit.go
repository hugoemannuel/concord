package guest

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

// inviteEvent: o link de visitante (o token nunca vai para o registro).
func inviteEvent(action audit.Action, actorID string, inv *Invite, changes []audit.Change) audit.Event {
	return audit.Event{
		ServerID: inv.ServerID, ActorID: actorID, Action: action,
		TargetType: audit.TargetInvite, TargetID: inv.ID, ChannelID: inv.ChannelID,
		Changes: changes,
	}
}

func createdChanges(in CreateInput) []audit.Change {
	return []audit.Change{
		{Field: "duration", After: in.Duration},
		{Field: "can_speak", After: in.CanSpeak},
		{Field: "can_stream", After: in.CanStream},
	}
}
