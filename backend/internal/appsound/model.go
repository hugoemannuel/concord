// Package appsound guarda, por pessoa, os sons que o próprio app toca para ela
// (mensagem, menção, entrar/sair da call, mutar...): o pacote escolhido, o
// volume, a escolha por evento e os áudios próprios que ela subiu.
// Ver docs/adr/0035-sons-do-app-personalizados.md.
package appsound

import (
	"errors"
	"regexp"
	"slices"
)

const (
	DefaultPack   = "salinha"
	DefaultVolume = 100
	// MaxVolume: até 200% (os sons sintetizados são baixos; dá para dobrar).
	MaxVolume = 200

	// ChoiceCustom: o evento toca o áudio que a pessoa subiu.
	ChoiceCustom = "custom"
	// ChoiceOff: o evento fica em silêncio.
	ChoiceOff = "off"
)

// Events são os sons que dá para trocar, com o mesmo nome do app (SoundName).
// Os jingles de nível não entram: acompanham a animação.
var Events = []string{
	"message", "mention", "ring",
	"join", "leave", "userJoin", "userLeave",
	"mute", "unmute", "deafen", "undeafen",
	"liveStart", "liveEnd", "liveJoin",
	"lock", "unlock", "knock",
	"update",
}

var ErrInvalidSettings = errors.New("invalid app sound settings")

// Pacote ou escolha: slug curto. O app conhece os pacotes; um nome que ele não
// conhece cai no padrão, então o servidor só confere o formato.
var slug = regexp.MustCompile(`^[a-z0-9-]{1,32}$`)

// Settings é o que a pessoa escolheu (o PUT manda isto inteiro).
type Settings struct {
	Pack   string            `json:"pack"`
	Volume int               `json:"volume"`
	Events map[string]string `json:"events"`
}

// View é o GET: as escolhas e, por evento, a URL do áudio próprio.
type View struct {
	Settings
	Custom map[string]string `json:"custom"`
}

func DefaultSettings() Settings {
	return Settings{Pack: DefaultPack, Volume: DefaultVolume, Events: map[string]string{}}
}

// ValidEvent diz se o evento é um dos sons trocáveis.
func ValidEvent(event string) bool { return slices.Contains(Events, event) }

// Validate confere pacote, volume e cada escolha por evento.
func (s Settings) Validate() error {
	if !slug.MatchString(s.Pack) || s.Volume < 0 || s.Volume > MaxVolume {
		return ErrInvalidSettings
	}
	for event, choice := range s.Events {
		if !ValidEvent(event) || !slug.MatchString(choice) {
			return ErrInvalidSettings
		}
	}
	return nil
}
