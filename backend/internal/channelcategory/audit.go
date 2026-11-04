package channelcategory

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
func (h *Handler) SetAudit(recorder AuditRecorder) { h.audit = recorder }

func (h *Handler) record(ctx context.Context, event audit.Event) {
	if h.audit != nil {
		h.audit.Record(ctx, event)
	}
}

// recordUpdate grava a edição; se nada mudou, não há o que registrar.
func (h *Handler) recordUpdate(ctx context.Context, event audit.Event) {
	if len(event.Changes) > 0 {
		h.record(ctx, event)
	}
}

// layoutSaved é o "type" da auditoria de channel.reorder quando a organização muda
// (os outros valores são "text" e "voice").
const layoutSaved = "layout"

func reorderedEvent(server, user string) audit.Event {
	return audit.Event{
		ServerID: server, ActorID: user, Action: audit.ChannelReorder,
		Changes: []audit.Change{{Field: "type", After: layoutSaved}},
	}
}

func categoryEvent(action audit.Action, server, user string, category Category, changes []audit.Change) audit.Event {
	return audit.Event{
		ServerID: server, ActorID: user, Action: action,
		TargetType: audit.TargetCategory, TargetID: category.ID, TargetName: category.Name,
		Changes: changes,
	}
}

func createdEvent(server, user string, category Category, private bool) audit.Event {
	changes := []audit.Change{{Field: "name", After: category.Name}}
	if private {
		changes = append(changes, audit.Change{Field: "private", After: true})
	}
	return categoryEvent(audit.CategoryCreate, server, user, category, changes)
}

// updatedEvent: o nome, se virou privada e quantos canais vinculados acompanharam.
func updatedEvent(server, user, everyone string, change CategoryChange) audit.Event {
	changes := audit.Diff(nil, "name", change.Before.Name, change.After.Name)
	changes = audit.Diff(changes, "private", isPrivate(change.Before.Overwrites, everyone), isPrivate(change.After.Overwrites, everyone))
	if !permission.SameOverwrites(change.Before.Overwrites, change.After.Overwrites) {
		changes = append(changes, audit.Change{Field: "overwrites", After: len(change.After.Overwrites)})
	}
	if change.Synced > 0 {
		changes = append(changes, audit.Change{Field: "synced_channels", After: change.Synced})
	}
	return categoryEvent(audit.CategoryUpdate, server, user, change.After, changes)
}
