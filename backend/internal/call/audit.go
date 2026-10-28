package call

import (
	"context"
	"log"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/channel"
)

type voiceAuditRecorder interface {
	Record(context.Context, audit.Event) error
}

func (h *Handler) SetAuditRecorder(recorder voiceAuditRecorder) {
	h.audit = recorder
}

func (h *Handler) recordVoice(ctx context.Context, event audit.Event) {
	if h.audit == nil {
		return
	}
	if err := h.audit.Record(ctx, event); err != nil {
		log.Printf("[auditoria] falha ao registrar ação de voz: %v", err)
	}
}

func (h *Handler) voiceChannelName(ctx context.Context, id string) string {
	ch, err := h.service.ChannelByID(ctx, id)
	if err != nil {
		return ""
	}
	return ch.Name
}

func (s *Service) ChannelByID(ctx context.Context, id string) (*channel.Channel, error) {
	return s.channelService.FindByID(ctx, id)
}

func (s *Service) CallScope(id string) (string, string, error) {
	return s.channelCall(id)
}
