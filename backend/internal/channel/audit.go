package channel

import (
	"context"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
)

// AuditRecorder grava no registro de auditoria do servidor (audit.Recorder).
type AuditRecorder interface {
	Record(ctx context.Context, e audit.Event)
}

// SetAudit liga o registro de auditoria (no boot).
func (h *Handler) SetAudit(r AuditRecorder) {
	h.audit = r
}

func (h *Handler) record(ctx context.Context, e audit.Event) {
	if h.audit != nil {
		h.audit.Record(ctx, e)
	}
}

func channelEvent(action audit.Action, actorID string, ch *Channel, changes []audit.Change) audit.Event {
	return audit.Event{
		ServerID: ch.ServerID, ActorID: actorID, Action: action,
		TargetType: audit.TargetChannel, TargetID: ch.ID, TargetName: ch.Name,
		Changes: changes,
	}
}

// createdChanges: nome, tipo e se nasceu privado.
func createdChanges(ch *Channel, private bool) []audit.Change {
	changes := []audit.Change{{Field: "name", After: ch.Name}, {Field: "type", After: ch.Type}}
	if private {
		changes = append(changes, audit.Change{Field: "private", After: true})
	}
	return changes
}

// recordUpdate grava a edição do canal (sem mudança, não grava).
func (h *Handler) recordUpdate(ctx context.Context, actorID string, before, after *Channel) {
	changes := audit.Diff(nil, "name", before.Name, after.Name)
	if len(changes) > 0 {
		h.record(ctx, channelEvent(audit.ChannelUpdate, actorID, after, changes))
	}
}

// recordOverwrite grava a troca da sobrescrita de um cargo ou membro no canal
// (next nil = apagou). O nome do alvo e o do canal saem na gravação.
func (h *Handler) recordOverwrite(ctx context.Context, actorID string, ch *Channel, targetType, targetID string, before permission.Overwrite, next *permission.Overwrite) {
	action, after := audit.ChannelOverwriteDelete, permission.Overwrite{}
	if next != nil {
		action, after = audit.ChannelOverwriteUpdate, *next
	}
	changes := audit.Diff(nil, "allow", before.Allow, after.Allow)
	changes = audit.Diff(changes, "deny", before.Deny, after.Deny)
	if len(changes) == 0 {
		return
	}
	h.record(ctx, audit.Event{
		ServerID: ch.ServerID, ActorID: actorID, Action: action,
		TargetType: targetType, TargetID: targetID, ChannelID: ch.ID,
		Changes: changes,
	})
}
