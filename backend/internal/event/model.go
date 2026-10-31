package event

import (
	"encoding/json"
	"errors"
	"time"
)

// Antecedências que o moderador pode escolher (minutos). O aviso na hora de
// começar (0) sempre existe e não entra aqui.
var AllowedOffsets = []int{1440, 60, 30, 15, 10, 5}

// DefaultOffsets: o que vale quando o pedido não diz nada.
var DefaultOffsets = []int{10, 5}

// MaxOffsets: no máximo 2 antecedências por evento.
const MaxOffsets = 2

// Durações que o moderador pode escolher (minutos): a sala do evento fecha
// quando a duração acaba. Sem escolha, vale DefaultDuration.
var AllowedDurations = []int{30, 60, 120, 180, 240}

const DefaultDuration = 120

const (
	MaxTitleRunes       = 100
	MaxDescriptionRunes = 1000
)

var (
	ErrMissingPermission  = errors.New("você não tem permissão para isso com os eventos deste servidor")
	ErrRoleNotFound       = errors.New("cargo não encontrado")
	ErrNotMember          = errors.New("você não é membro deste servidor")
	ErrEventNotFound      = errors.New("evento não encontrado")
	ErrInPast             = errors.New("o início do evento precisa estar no futuro")
	ErrInvalidTitle       = errors.New("o título precisa ter de 1 a 100 caracteres")
	ErrInvalidDescription = errors.New("a descrição pode ter até 1000 caracteres")
	ErrInvalidRecurrence  = errors.New("repetição inválida")
	ErrInvalidReminder    = errors.New("antecedência de aviso inválida")
	ErrTooManyReminders   = errors.New("escolha no máximo 2 antecedências de aviso")
	ErrInvalidDuration    = errors.New("duração do evento inválida")
	ErrEventRunning       = errors.New("com o evento em andamento só dá para mudar título, descrição e banner")
	ErrInvalidBanner      = errors.New("banner inválido")
	ErrEventEnded         = errors.New("este evento já terminou")
)

// Event é o evento como o app o recebe.
type Event struct {
	ID              string    `json:"id"`
	ServerID        string    `json:"server_id"`
	Scope           string    `json:"scope"`
	Title           string    `json:"title"`
	Description     string    `json:"description"`
	BannerID        *string   `json:"banner_id"`
	StartsAt        time.Time `json:"starts_at"`
	NextStartAt     time.Time `json:"next_start_at"`
	DurationMinutes int       `json:"duration_minutes"`
	// A sala da ocorrência em andamento (voz e texto); nil fora do horário do evento.
	VoiceChannelID  *string    `json:"voice_channel_id"`
	TextChannelID   *string    `json:"text_channel_id"`
	Recurrence      Recurrence `json:"recurrence"`
	RecurrenceUntil *time.Time `json:"recurrence_until"`
	RecurrenceCount *int       `json:"recurrence_count"`
	OccurrencesDone int        `json:"occurrences_done"`
	ReminderOffsets []int      `json:"reminder_offsets"`
	CreatedBy       *string    `json:"created_by"`
	CanceledAt      *time.Time `json:"canceled_at,omitempty"`
	FinishedAt      *time.Time `json:"finished_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	GoingCount      int        `json:"going_count"`
	MyRSVP          *bool      `json:"my_rsvp"`
}

// Going é quem disse "vou" na ocorrência atual.
type Going struct {
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

// Input é o que o moderador manda para criar ou editar.
type Input struct {
	Title       string    `json:"title"`
	Description string    `json:"description"`
	BannerID    *string   `json:"banner_id"`
	StartsAt    time.Time `json:"starts_at"`
	// 0 = DefaultDuration; senão, uma das AllowedDurations.
	DurationMinutes int        `json:"duration_minutes"`
	Recurrence      Recurrence `json:"recurrence"`
	RecurrenceUntil *time.Time `json:"recurrence_until"`
	RecurrenceCount *int       `json:"recurrence_count"`
	// nil = padrão [10, 5]; lista vazia = só o aviso na hora.
	ReminderOffsets []int `json:"reminder_offsets"`
}

func marshalEvent(typ string, payload any) []byte {
	data, err := json.Marshal(map[string]any{"type": typ, "payload": payload})
	if err != nil {
		return nil
	}
	return data
}
