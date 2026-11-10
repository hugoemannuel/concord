package message

import (
	"context"

	"gin-quickstart/backend/internal/permission"
)

// Para onde a pessoa pode encaminhar: os canais de texto dos servidores dela
// em que tem SEND_MESSAGES. As DMs o app já tem na lista de conversas.

type ForwardTargetChannel struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ForwardTargetServer struct {
	ID       string                 `json:"id"`
	Name     string                 `json:"name"`
	IconURL  string                 `json:"icon_url,omitempty"`
	Channels []ForwardTargetChannel `json:"channels"`
}

// ForwardChannelCandidate: um canal do servidor como o diretório o lê.
type ForwardChannelCandidate struct {
	ID     string
	Name   string
	Type   string
	System bool
}

// TargetDirectory lista os servidores da pessoa e os canais de um servidor,
// na ordem da barra lateral (ligado em cmd/).
type TargetDirectory interface {
	UserServers(ctx context.Context, userID string) ([]ForwardTargetServer, error)
	ServerChannels(ctx context.Context, serverID string) ([]ForwardChannelCandidate, error)
}

type ForwardTargets struct {
	dir   TargetDirectory
	perms PermissionChecker
}

func NewForwardTargets(dir TargetDirectory, perms PermissionChecker) *ForwardTargets {
	return &ForwardTargets{dir: dir, perms: perms}
}

// List: cada servidor com os canais em que a pessoa pode enviar; servidor sem
// nenhum fica de fora.
func (t *ForwardTargets) List(ctx context.Context, userID string) ([]ForwardTargetServer, error) {
	servers, err := t.dir.UserServers(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := []ForwardTargetServer{}
	for _, s := range servers {
		channels, err := t.dir.ServerChannels(ctx, s.ID)
		if err != nil {
			return nil, err
		}
		s.Channels = t.sendable(ctx, channels, userID)
		if len(s.Channels) > 0 {
			out = append(out, s)
		}
	}
	return out, nil
}

// sendable: os canais de texto comuns (sem os de sistema) em que a pessoa pode enviar.
func (t *ForwardTargets) sendable(ctx context.Context, channels []ForwardChannelCandidate, userID string) []ForwardTargetChannel {
	var out []ForwardTargetChannel
	for _, ch := range channels {
		if ch.Type != "text" || ch.System {
			continue
		}
		if channelAccess(ctx, t.perms, ch.ID, userID, permission.ViewChannel|permission.SendMessages) == nil {
			out = append(out, ForwardTargetChannel{ID: ch.ID, Name: ch.Name})
		}
	}
	return out
}
