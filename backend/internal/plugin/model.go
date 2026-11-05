// Package plugin guarda os plugins da comunidade: painéis de terceiros
// exibidos em iframe isolado, aprovados pelo time antes de poderem ser instalados.
package plugin

import (
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

// EventChanged avisa os clientes que a lista de plugins mudou.
const EventChanged = "plugins:changed"

const (
	maxNameRunes = 40
	maxDescRunes = 120
	maxURLLen    = 2048
	maxNoteRunes = 500
)

var (
	ErrInvalidName        = errors.New("nome do plugin deve ter de 1 a 40 caracteres")
	ErrInvalidDescription = errors.New("descrição do plugin deve ter de 1 a 120 caracteres")
	ErrInvalidIcon        = errors.New("ícone do plugin fora da lista permitida")
	ErrInvalidURL         = errors.New("a URL do painel deve usar https e ter até 2048 caracteres")
	ErrInvalidTransition  = errors.New("transição de status inválida")
	ErrNotFound           = errors.New("plugin não encontrado")
	ErrNotApproved        = errors.New("plugin não aprovado")
	ErrForbidden          = errors.New("sem permissão para esta ação com o plugin")
	ErrNoteRequired       = errors.New("retirar um plugin aprovado exige um motivo")
	ErrInvalidNote        = errors.New("o motivo deve ter até 500 caracteres")
)

// Ícones permitidos na ficha: lista fixa de SVGs do app (nunca uma URL do autor,
// que vazaria o IP de quem vê o botão; docs/adr/0056).
const (
	IconPuzzle = "quebra-cabeca"
	IconBall   = "bola"
)

type Status string

const (
	StatusPending  Status = "pending"
	StatusApproved Status = "approved"
	StatusRejected Status = "rejected"
)

type Plugin struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	PanelURL       string    `json:"panel_url"`
	Icon           string    `json:"icon"`
	AuthorID       string    `json:"author_id"`
	AuthorUsername string    `json:"author_username"`
	Status         Status    `json:"status"`
	ReviewNote     *string   `json:"review_note"`
	ReviewedBy     *string   `json:"-"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ServerPlugin é um plugin visto por um servidor, com o estado de instalação.
type ServerPlugin struct {
	Plugin
	Enabled bool `json:"enabled"`
}

// Draft é o que o autor envia ao cadastrar ou editar um plugin.
type Draft struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	PanelURL    string `json:"panel_url"`
	Icon        string `json:"icon"` // vazio = padrão (quebra-cabeça)
}

var transitions = map[Status][]Status{
	StatusPending:  {StatusApproved, StatusRejected},
	StatusApproved: {StatusRejected},
	StatusRejected: {StatusApproved},
}

// CanTransition diz se o time pode mover o plugin de from para to.
func CanTransition(from, to Status) bool {
	for _, s := range transitions[from] {
		if s == to {
			return true
		}
	}
	return false
}

// ValidateNote: o motivo tem até 500 caracteres e é obrigatório ao retirar (approved → rejected).
func ValidateNote(from, to Status, note *string) error {
	if note != nil && utf8.RuneCountInString(*note) > maxNoteRunes {
		return ErrInvalidNote
	}
	withdraw := from == StatusApproved && to == StatusRejected
	if withdraw && (note == nil || strings.TrimSpace(*note) == "") {
		return ErrNoteRequired
	}
	return nil
}

// ValidateDraft aparia os campos, valida limites e normaliza a URL.
func ValidateDraft(d Draft) (Draft, error) {
	d.Name = strings.TrimSpace(d.Name)
	d.Description = strings.TrimSpace(d.Description)
	d.PanelURL = strings.TrimSpace(d.PanelURL)
	if !runesBetween(d.Name, maxNameRunes) {
		return Draft{}, ErrInvalidName
	}
	if !runesBetween(d.Description, maxDescRunes) {
		return Draft{}, ErrInvalidDescription
	}
	panel, err := normalizePanelURL(d.PanelURL)
	if err != nil {
		return Draft{}, err
	}
	d.PanelURL = panel
	icon, err := normalizeIcon(d.Icon)
	if err != nil {
		return Draft{}, err
	}
	d.Icon = icon
	return d, nil
}

func normalizeIcon(icon string) (string, error) {
	switch icon {
	case "":
		return IconPuzzle, nil
	case IconPuzzle, IconBall:
		return icon, nil
	}
	return "", ErrInvalidIcon
}

func runesBetween(s string, max int) bool {
	n := utf8.RuneCountInString(s)
	return n >= 1 && n <= max
}

func normalizePanelURL(raw string) (string, error) {
	if raw == "" || len(raw) > maxURLLen {
		return "", ErrInvalidURL
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.Hostname() == "" {
		return "", ErrInvalidURL
	}
	return u.String(), nil
}

func marshalEvent(typ string, payload any) []byte {
	data, err := json.Marshal(map[string]any{"type": typ, "payload": payload})
	if err != nil {
		return nil
	}
	return data
}
