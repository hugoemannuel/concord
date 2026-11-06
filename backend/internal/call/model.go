package call

import (
	"time"

	"gin-quickstart/backend/internal/cosmetics"
	"gin-quickstart/backend/internal/namestyle"
	"gin-quickstart/backend/internal/platform/wsevent"
)

const (
	TypeDM      = "dm"
	TypeChannel = "channel"

	StatusRinging = "ringing"
	StatusActive  = "active"
	StatusEnded   = "ended"

	RoleMember    = "member"
	RolePresenter = "presenter"
)

type Call struct {
	ID             string     `json:"id"`
	Type           string     `json:"type"`
	ConversationID *string    `json:"conversation_id,omitempty"`
	ChannelID      *string    `json:"channel_id,omitempty"`
	ServerID       *string    `json:"server_id,omitempty"`
	InitiatorID    string     `json:"initiator_id"`
	Status         string     `json:"status"`
	StartedAt      time.Time  `json:"started_at"`
	EndedAt        *time.Time `json:"ended_at,omitempty"`
	// Locked: sala de voz trancada — só entra quem for aceito por alguém de
	// dentro. Transitório (memória), não é persistido.
	Locked bool `json:"locked"`
}

type CallParticipant struct {
	CallID   string     `json:"call_id"`
	UserID   string     `json:"user_id"`
	Role     string     `json:"role"`
	JoinedAt time.Time  `json:"joined_at"`
	LeftAt   *time.Time `json:"left_at,omitempty"`
	// Estado de voz/tela guardado para o reinício do backend (RestoreActive).
	Muted         bool `json:"muted"`
	Deafened      bool `json:"deafened"`
	ScreenSharing bool `json:"screen_sharing"`
	// Silenciado/ensurdecido por um moderador.
	ServerMuted    bool `json:"server_muted"`
	ServerDeafened bool `json:"server_deafened"`
}

type UserInfo struct {
	ID          string          `json:"id"`
	Username    string          `json:"username"`
	DisplayName string          `json:"display_name"`
	AvatarURL   *string         `json:"avatar_url,omitempty"`
	NameStyle   namestyle.Style `json:"name_style"`
	cosmetics.Look
	// EntranceSoundURL: o som que toca quando a pessoa entra (nil = padrão).
	EntranceSoundURL *string `json:"entrance_sound_url,omitempty"`
	// GuestOf: servidor de que a pessoa é visitante (selo "Visitante"; ver guest.go).
	GuestOf string `json:"guest_of,omitempty"`
}

// Server -> Client events

type InviteEvent struct {
	CallID         string   `json:"call_id"`
	Type           string   `json:"type"`
	Initiator      UserInfo `json:"initiator"`
	ConversationID *string  `json:"conversation_id,omitempty"`
	ChannelID      *string  `json:"channel_id,omitempty"`
	ServerID       *string  `json:"server_id,omitempty"`
}

type RingEvent struct {
	CallID string   `json:"call_id"`
	Callee UserInfo `json:"callee"`
}

type ResponseEvent struct {
	CallID string   `json:"call_id"`
	User   UserInfo `json:"user"`
}

type StateEvent struct {
	CallID string   `json:"call_id"`
	User   UserInfo `json:"user"`
}

// ScreenEvent sinaliza que um participante começou ("active": true) ou parou
// de compartilhar tela na chamada. O estado fica salvo em call_participants
// para voltar depois de um reinício do backend.
type ScreenEvent struct {
	CallID string   `json:"call_id"`
	User   UserInfo `json:"user"`
	Active bool     `json:"active"`
}

// ScreenWatchersEvent avisa a lista de quem está assistindo à transmissão de um usuário.
type ScreenWatchersEvent struct {
	CallID   string     `json:"call_id"`
	SharerID string     `json:"sharer_id"`
	Watchers []UserInfo `json:"watchers"`
}

type EndedEvent struct {
	CallID string `json:"call_id"`
}

type BusyEvent struct {
	CallID string `json:"call_id"`
}

type ErrorEvent struct {
	CallID  string `json:"call_id,omitempty"`
	Message string `json:"message"`
}

// LiveEvent: participante começou/parou de transmitir. Vai para a sala do
// servidor (selo LIVE na lista do canal de voz de quem está fora da chamada).
type LiveEvent struct {
	CallID    string  `json:"call_id"`
	ChannelID *string `json:"channel_id,omitempty"`
	UserID    string  `json:"user_id"`
	Active    bool    `json:"active"`
}

// Client -> Server payloads

type InvitePayload struct {
	Type           string `json:"type"`
	ConversationID string `json:"conversation_id,omitempty"`
	ChannelID      string `json:"channel_id,omitempty"`
}

// VoiceEvent: participante mutou/desmutou ou ensurdeceu. Vai para a chamada e
// para o servidor (lista do canal de voz de quem não está na chamada).
type VoiceEvent struct {
	CallID    string  `json:"call_id"`
	ChannelID *string `json:"channel_id,omitempty"`
	UserID    string  `json:"user_id"`
	Muted     bool    `json:"muted"`
	Deafened  bool    `json:"deafened"`
	// Impostos por um moderador; o app soma ao mudo/ensurdecido do próprio.
	ServerMuted    bool `json:"server_muted"`
	ServerDeafened bool `json:"server_deafened"`
}

type VoicePayload struct {
	CallID   string `json:"call_id"`
	Muted    bool   `json:"muted"`
	Deafened bool   `json:"deafened"`
}

type ScreenPayload struct {
	CallID string `json:"call_id"`
	Active bool   `json:"active"`
}

// ScreenWatchPayload sinaliza que o participante começou ou parou de assistir à transmissão de SharerID.
type ScreenWatchPayload struct {
	CallID   string `json:"call_id"`
	SharerID string `json:"sharer_id"`
	Watching bool   `json:"watching"`
}

type LeavePayload struct {
	CallID string `json:"call_id"`
}

// Epic Pen / Screen Annotation models

type DrawPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type DrawStroke struct {
	ID        string      `json:"id"`
	SharerID  string      `json:"sharer_id"`
	UserID    string      `json:"user_id"`
	Tool      string      `json:"tool"` // "pen", "highlighter", "laser"
	Color     string      `json:"color"`
	Width     float64     `json:"width"`
	Points    []DrawPoint `json:"points"`
	CreatedAt int64       `json:"created_at"`
	FadeOut   bool        `json:"fade_out,omitempty"`
}

type ScreenDrawPayload struct {
	CallID   string     `json:"call_id"`
	SharerID string     `json:"sharer_id"`
	Stroke   DrawStroke `json:"stroke"`
}

type ScreenDrawClearPayload struct {
	CallID   string `json:"call_id"`
	SharerID string `json:"sharer_id"`
}

type ScreenDrawUndoPayload struct {
	CallID   string `json:"call_id"`
	SharerID string `json:"sharer_id"`
	StrokeID string `json:"stroke_id"`
}

// marshalEvent monta o envelope dos eventos (platform/wsevent).
var marshalEvent = wsevent.Marshal
