package message

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

// recordModeration grava a ação de um moderador sobre a mensagem de authorID
// (o próprio autor apagando a sua não entra no registro). O conteúdo da
// mensagem nunca vai para o registro.
func (s *Service) recordModeration(ctx context.Context, action audit.Action, serverID, channelID, authorID, actorID string) {
	if s.audit == nil || (action == audit.MessageDelete && authorID == actorID) {
		return
	}
	s.audit.Record(ctx, audit.Event{
		ServerID: serverID, ActorID: actorID, Action: action,
		TargetType: audit.TargetMember, TargetID: authorID, ChannelID: channelID,
	})
}
