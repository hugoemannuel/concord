package call

import (
	"context"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/channel"
)

// VoiceModerator é o que a moderação de voz usa do Service.
type VoiceModerator interface {
	SetServerMute(ctx context.Context, callID, actorID, targetID string, muted bool) error
	SetServerDeafen(ctx context.Context, callID, actorID, targetID string, deafened bool) error
	DisconnectParticipant(ctx context.Context, callID, actorID, targetID string) error
	MoveToChannel(ctx context.Context, actorID, targetID, channelID string) (*Call, error)
	VoiceLocationOf(userID string) (VoiceLocation, bool)
}

// AuditRecorder grava no registro de auditoria do servidor (audit.Recorder).
type AuditRecorder interface {
	Record(ctx context.Context, e audit.Event)
}

// ChannelFinder dá o nome dos canais de voz de origem e destino de quem é movido.
type ChannelFinder interface {
	FindByID(ctx context.Context, id string) (*channel.Channel, error)
}

// SetAudit liga o registro de auditoria da moderação de voz (no boot).
func (h *Handler) SetAudit(r AuditRecorder, channels ChannelFinder) {
	h.audit, h.channels = r, channels
}

// callLocation: onde targetID está, se está nesta call (de canal).
func (h *Handler) callLocation(callID, targetID string) (VoiceLocation, bool) {
	loc, ok := h.moderator.VoiceLocationOf(targetID)
	return loc, ok && loc.CallID == callID
}

func (h *Handler) recordVoice(ctx context.Context, actorID, callID, targetID string, action audit.Action, change audit.Change) {
	loc, inCall := h.callLocation(callID, targetID)
	h.recordAt(ctx, actorID, targetID, action, loc, inCall, change)
}

// recordAt grava a ação de voz no canal loc; fora de canal de voz não há
// servidor nem lugar, e nada é gravado.
func (h *Handler) recordAt(ctx context.Context, actorID, targetID string, action audit.Action, loc VoiceLocation, inCall bool, changes ...audit.Change) {
	if h.audit == nil || !inCall {
		return
	}
	h.audit.Record(ctx, audit.Event{
		ServerID: loc.ServerID, ActorID: actorID, Action: action,
		TargetType: audit.TargetMember, TargetID: targetID, ChannelID: loc.ChannelID,
		Changes: changes,
	})
}

// recordMove: o canal de destino em ChannelID; de onde para onde em "channel".
func (h *Handler) recordMove(ctx context.Context, actorID, targetID string, from VoiceLocation, to *Call) {
	if to == nil || to.ChannelID == nil || to.ServerID == nil {
		return
	}
	dest := VoiceLocation{ServerID: *to.ServerID, ChannelID: *to.ChannelID}
	change := audit.Change{Field: "channel", Before: h.channelName(ctx, from.ChannelID), After: h.channelName(ctx, dest.ChannelID)}
	h.recordAt(ctx, actorID, targetID, audit.VoiceMove, dest, true, change)
}

func (h *Handler) channelName(ctx context.Context, id string) string {
	if h.channels == nil || id == "" {
		return ""
	}
	if ch, err := h.channels.FindByID(ctx, id); err == nil {
		return ch.Name
	}
	return ""
}
