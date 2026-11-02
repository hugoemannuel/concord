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
)

var (
	ErrInvalidName        = errors.New("nome do plugin deve ter de 1 a 40 caracteres")
	ErrInvalidDescription = errors.New("descrição do plugin deve ter de 1 a 120 caracteres")
	ErrInvalidURL         = errors.New("a URL do painel deve usar https e ter até 2048 caracteres")
	ErrInvalidTransition  = errors.New("transição de status inválida")
	ErrNotFound           = errors.New("plugin não encontrado")
	ErrNotApproved        = errors.New("plugin não aprovado")
	ErrForbidden          = errors.New("sem permissão para esta ação com o plugin")
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
	Name        string
	Description string
	PanelURL    string
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
	return d, nil
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
