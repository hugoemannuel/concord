package server

import (
	"context"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/bot"
)

// AuditRecorder grava no registro de auditoria do servidor (audit.Recorder).
type AuditRecorder interface {
	Record(ctx context.Context, e audit.Event)
}

// record grava se o registro estiver ligado (nos testes antigos, não está).
func record(ctx context.Context, r AuditRecorder, e audit.Event) {
	if r != nil {
		r.Record(ctx, e)
	}
}

func memberEvent(serverID, actorID string, action audit.Action, targetID string) audit.Event {
	return audit.Event{
		ServerID: serverID, ActorID: actorID, Action: action,
		TargetType: audit.TargetMember, TargetID: targetID,
	}
}

// SetAudit liga o registro de auditoria (no boot).
func (m *Moderation) SetAudit(r AuditRecorder) { m.audit = r }

// SetAudit liga o registro de auditoria (no boot).
func (n *Nicknames) SetAudit(r AuditRecorder) { n.audit = r }

// previousNickname: o apelido antes da troca, só quando outra pessoa troca
// (o próprio apelido não vai para o registro).
func (n *Nicknames) previousNickname(ctx context.Context, serverID, actorID, targetID string) *string {
	if n.audit == nil || actorID == targetID {
		return nil
	}
	nick, _ := n.store.MemberNickname(ctx, serverID, targetID)
	return nick
}

func (n *Nicknames) recordNickname(ctx context.Context, serverID, actorID, targetID string, before, after *string) {
	if actorID == targetID {
		return
	}
	e := memberEvent(serverID, actorID, audit.MemberNickname, targetID)
	e.Changes = audit.DiffPtr(nil, "nick", before, after)
	record(ctx, n.audit, e)
}

// SetAudit liga o registro de auditoria (no boot).
func (h *Handler) SetAudit(r AuditRecorder) { h.audit = r }

// SetAudit liga o registro de auditoria (no boot).
func (s *Service) SetAudit(r AuditRecorder) { s.audit = r }

func serverEvent(actorID string, srv *Server, changes []audit.Change) audit.Event {
	return audit.Event{
		ServerID: srv.ID, ActorID: actorID, Action: audit.ServerUpdate,
		TargetType: audit.TargetServer, TargetID: srv.ID, TargetName: srv.Name,
		Changes: changes,
	}
}

// recordServerChanges grava a edição do servidor (sem mudança, não grava).
func (h *Handler) recordServerChanges(ctx context.Context, actorID string, srv *Server, changes []audit.Change) {
	if len(changes) > 0 {
		record(ctx, h.audit, serverEvent(actorID, srv, changes))
	}
}

// recordServerUpdate: nome e ícone (antes nil = não deu para ler o antigo).
func (h *Handler) recordServerUpdate(ctx context.Context, actorID string, before, after *Server) {
	if before == nil {
		before = &Server{}
	}
	changes := audit.Diff(nil, "name", before.Name, after.Name)
	changes = audit.Diff(changes, "icon", before.IconURL, after.IconURL)
	h.recordServerChanges(ctx, actorID, after, changes)
}

func (h *Handler) recordIcon(ctx context.Context, actorID string, after *Server, old *string) {
	before := ""
	if old != nil {
		before = *old
	}
	h.recordServerChanges(ctx, actorID, after, audit.Diff(nil, "icon", before, after.IconURL))
}

// recordPrimaryChannel: o canal novo vai em ChannelID (o nome sai na gravação).
func (h *Handler) recordPrimaryChannel(ctx context.Context, actorID string, before, after *Server) {
	if before == nil {
		before = &Server{}
	}
	changes := audit.DiffPtr(nil, "primary_channel", before.PrimaryChannelID, after.PrimaryChannelID)
	if len(changes) == 0 {
		return
	}
	e := serverEvent(actorID, after, changes)
	e.ChannelID = *after.PrimaryChannelID
	record(ctx, h.audit, e)
}

func (h *Handler) recordMusicBot(ctx context.Context, serverID, actorID string, enabled bool) {
	action := audit.BotRemove
	if enabled {
		action = audit.BotAdd
	}
	record(ctx, h.audit, memberEvent(serverID, actorID, action, bot.UserID))
}
