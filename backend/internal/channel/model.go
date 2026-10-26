package channel

import (
	"time"

	"gin-quickstart/backend/internal/permission"
)

const (
	TypeText  = "text"
	TypeVoice = "voice"

	// SystemChannelName: nome do canal de sistema do Maestro.
	SystemChannelName = "bot"
	// NoticesChannelName: nome do canal de sistema de avisos e boas-vindas.
	NoticesChannelName = "avisos"
)

type Channel struct {
	ID        string    `json:"id"`
	ServerID  string    `json:"server_id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Position  int       `json:"position"`
	// IsSystem: canal fixo do servidor ("bot" e "avisos"); não pode ser editado nem removido, só movido.
	IsSystem  bool      `json:"is_system"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// Overwrites: sobrescritas de permissão do canal (canal privado = deny de
	// VIEW_CHANNEL no @everyone). Preenchido a partir do snapshot de permissões.
	Overwrites []permission.Overwrite `json:"overwrites"`
}

type CreateEvent struct {
	ServerID string  `json:"server_id"`
	Channel  Channel `json:"channel"`
}

type DeleteEvent struct {
	ServerID  string `json:"server_id"`
	ChannelID string `json:"channel_id"`
}

// ReorderEvent: nova ordem dos canais de um tipo (texto ou voz) do servidor.
// RequestID é o que o cliente mandou no pedido: ele reconhece o próprio eco.
type ReorderEvent struct {
	ServerID   string   `json:"server_id"`
	Type       string   `json:"type"`
	ChannelIDs []string `json:"channel_ids"`
	RequestID  string   `json:"request_id,omitempty"`
}
