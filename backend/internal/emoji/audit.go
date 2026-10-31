package emoji

import (
	"context"

	"gin-quickstart/backend/internal/audit"
)

// AuditRecorder grava no registro de auditoria do servidor (audit.Recorder).
type AuditRecorder interface {
	Record(ctx context.Context, e audit.Event)
}

// SetAudit liga o registro de auditoria (no boot).
func (h *Handler) SetAudit(r AuditRecorder) {
	h.audit = r
}

func (h *Handler) record(ctx context.Context, action audit.Action, actorID, serverID, id, name string) {
	if h.audit == nil {
		return
	}
	h.audit.Record(ctx, audit.Event{
		ServerID: serverID, ActorID: actorID, Action: action,
		TargetType: audit.TargetEmoji, TargetID: id, TargetName: name,
	})
}
