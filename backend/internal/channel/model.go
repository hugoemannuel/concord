package channel

import (
	"time"

	"gin-quickstart/backend/internal/permission"
)

const (
	TypeText  = "text"
	TypeVoice = "voice"

	// SystemChannelName: nome com que nasce o canal de sistema do Maestro.
	SystemChannelName = "musica"
	// NoticesChannelName: nome com que nasce o canal de sistema de avisos e boas-vindas.
	NoticesChannelName = "avisos"

	// SystemKindMaestro e SystemKindNotices: o tipo (channels.system_kind) que
	// identifica cada canal de sistema; o nome não decide nada (ADR 0059).
	SystemKindMaestro = "maestro"
	SystemKindNotices = "notices"
)

type Channel struct {
	ID       string `json:"id"`
	ServerID string `json:"server_id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Position int    `json:"position"`
	// CategoryID: destino opcional da criação; a organização é lida na API de categorias.
	CategoryID *string `json:"category_id,omitempty"`
	// IsSystem: canal fixo do servidor ("musica" e "avisos"); não pode ser editado nem removido, só movido.
	IsSystem bool `json:"is_system"`
	// SystemKind: qual canal de sistema é ("maestro" ou "notices"); null nos demais.
	SystemKind *string `json:"system_kind"`
	// Managed: canal de uma sala de evento. Só o evento o cria e o apaga; o app não o edita.
	Managed bool `json:"managed"`
	// SlowmodeSeconds: modo lento, intervalo mínimo entre as mensagens de cada
	// membro (0 = desligado). Ver slowmode.go.
	SlowmodeSeconds int `json:"slowmode_seconds"`
	// DisappearingSeconds: prazo das mensagens temporárias do canal (nil = desativado).
	// Ver disappearing.go.
	DisappearingSeconds *int `json:"disappearing_seconds"`
	// AllowViewOnce: se o canal aceita mensagens de visualização única.
	AllowViewOnce bool      `json:"allow_view_once"`
	CreatedBy     string    `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
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

// systemChannel: o canal fixo (#musica ou #avisos) que nasce com o servidor.
func systemChannel(serverID, name, kind, createdBy string) *Channel {
	return &Channel{ServerID: serverID, Name: name, Type: TypeText, CreatedBy: createdBy, IsSystem: true, SystemKind: &kind}
}
