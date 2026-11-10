package castigo

import (
	"context"
	"strings"

	"gin-quickstart/backend/internal/audit"
)

// AuditRecorder grava no registro de auditoria do servidor (audit.Recorder).
type AuditRecorder interface {
	Record(ctx context.Context, e audit.Event)
}

// SetAudit liga o registro de auditoria (no boot).
func (s *Service) SetAudit(r AuditRecorder) { s.audit = r }

func (s *Service) record(ctx context.Context, e audit.Event) {
	if s.audit != nil {
		s.audit.Record(ctx, e)
	}
}

// names: os efeitos como o registro guarda ("speak,listen").
func (e Effects) names() string {
	var out []string
	for _, f := range []struct {
		on   bool
		name string
	}{{e.Speak, "speak"}, {e.Connect, "connect"}, {e.Listen, "listen"}} {
		if f.on {
			out = append(out, f.name)
		}
	}
	return strings.Join(out, ",")
}

// applyEvent: quem castigou (ou abriu a votação aprovada), o quê e por quanto tempo.
func applyEvent(p punishment) audit.Event {
	via := "direct"
	if p.byVote {
		via = "vote"
	}
	return audit.Event{
		ServerID: p.serverID, ActorID: p.actorID, Action: audit.VoiceCastigo,
		TargetType: audit.TargetMember, TargetID: p.req.UserID, ChannelID: p.channelID,
		Changes: []audit.Change{
			{Field: "castigo_effects", After: p.req.Effects.names()},
			{Field: "castigo_duration", After: p.req.Duration},
			{Field: "via", After: via},
		},
	}
}

func liftEvent(serverID, actorID, targetID string) audit.Event {
	return audit.Event{
		ServerID: serverID, ActorID: actorID, Action: audit.VoiceCastigoLift,
		TargetType: audit.TargetMember, TargetID: targetID,
	}
}
