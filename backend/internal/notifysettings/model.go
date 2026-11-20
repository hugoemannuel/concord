package notifysettings

import (
	"errors"
	"time"
)

const (
	LevelAll      = "all"
	LevelMentions = "mentions"
	LevelNothing  = "nothing"
)

var ErrInvalidSettings = errors.New("invalid notification settings")

// Settings é a preferência de uma pessoa para um servidor ou canal. Muted com
// MutedUntil nulo é "até eu reativar"; o app trata MutedUntil vencido como
// reativado.
type Settings struct {
	Muted            bool       `json:"muted"`
	MutedUntil       *time.Time `json:"muted_until"`
	Level            string     `json:"level"`
	SuppressEveryone bool       `json:"suppress_everyone"`
	// SuppressRoles: ignorar menções de cargo (só por servidor; ADR 0065).
	SuppressRoles bool `json:"suppress_roles"`
}

// All é tudo que a pessoa configurou, por id de servidor e de canal.
type All struct {
	Servers  map[string]Settings `json:"servers"`
	Channels map[string]Settings `json:"channels"`
}

// IsDefault: o padrão não ocupa linha no banco.
func (s Settings) IsDefault() bool {
	return !s.Muted && s.Level == LevelAll && !s.SuppressEveryone && !s.SuppressRoles
}

// normalize valida e arruma: sem mute não há prazo, e prazo já vencido vira
// "não silenciado".
func (s Settings) normalize(now time.Time) (Settings, error) {
	if s.Level == "" {
		s.Level = LevelAll
	}
	switch s.Level {
	case LevelAll, LevelMentions, LevelNothing:
	default:
		return Settings{}, ErrInvalidSettings
	}
	if s.Muted && s.MutedUntil != nil && !s.MutedUntil.After(now) {
		s.Muted = false
	}
	if !s.Muted {
		s.MutedUntil = nil
	}
	return s, nil
}
