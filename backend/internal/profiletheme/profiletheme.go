// Package profiletheme é o visual do cartão de perfil: borda, fundo do corpo
// (cor ou degradê, como o tema de perfil do Nitro), um efeito por cima e as
// opções finas (extras.go).
// Os IDs daqui têm de ser os mesmos do app (frontend lib/profileTheme.ts; um
// teste de lá confere as listas).
package profiletheme

import (
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
)

var ErrInvalid = errors.New("tema de perfil inválido")

var Borders = []string{"none", "solid", "neon", "rainbow", "gradient"}

var Backgrounds = []string{"default", "solid", "gradient", "pride"}

// Os três primeiros são CSS; os outros, canvas no app.
var Effects = []string{
	"none", "particles", "sparkles", "snow",
	"fire", "matrix", "glitch", "storm", "galaxy", "aurora", "hearts", "confetti", "synthwave", "rain",
	"fireflies", "sakura", "leaves", "bubbles", "ocean", "meteors", "fog", "sunbeams", "lava",
	"money", "clouds", "hexagons", "pixels", "bunting", "fireworks",
}

// borderColors e backgroundColors: quantas cores cada opção usa (exatamente).
var borderColors = map[string]int{"none": 0, "solid": 1, "neon": 1, "rainbow": 0, "gradient": 2}

var backgroundColors = map[string]int{"default": 0, "solid": 1, "gradient": 2, "pride": 0}

var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type Theme struct {
	Border           string   `json:"border"`
	BorderColors     []string `json:"border_colors"`
	Background       string   `json:"background"`
	BackgroundColors []string `json:"background_colors"`
	Effect           string   `json:"effect"`
	// Extras sai no JSON no mesmo nível (campo embutido).
	Extras
}

func Default() Theme {
	return Theme{
		Border:           "none",
		BorderColors:     []string{},
		Background:       "default",
		BackgroundColors: []string{},
		Effect:           "none",
		Extras:           DefaultExtras(),
	}
}

func invalid(msg string) error {
	return fmt.Errorf("%w: %s", ErrInvalid, msg)
}

func colors(in []string, want int, what string) ([]string, error) {
	if len(in) != want {
		return nil, invalid(fmt.Sprintf("%s precisa de %d cor(es)", what, want))
	}
	out := make([]string, 0, len(in))
	for _, c := range in {
		if !colorPattern.MatchString(c) {
			return nil, invalid("cor inválida")
		}
		out = append(out, strings.ToLower(c))
	}
	return out, nil
}

// Validate confere os IDs e as cores e devolve o tema arrumado (cores em
// minúsculas, listas nunca nil).
func Validate(t Theme) (Theme, error) {
	if !slices.Contains(Borders, t.Border) {
		return Theme{}, invalid("borda desconhecida")
	}
	if !slices.Contains(Backgrounds, t.Background) {
		return Theme{}, invalid("fundo desconhecido")
	}
	if !slices.Contains(Effects, t.Effect) {
		return Theme{}, invalid("efeito desconhecido")
	}
	border, err := colors(t.BorderColors, borderColors[t.Border], "a borda")
	if err != nil {
		return Theme{}, err
	}
	background, err := colors(t.BackgroundColors, backgroundColors[t.Background], "o fundo")
	if err != nil {
		return Theme{}, err
	}
	extras, err := validateExtras(t.Extras)
	if err != nil {
		return Theme{}, err
	}
	return Theme{
		Border:           t.Border,
		BorderColors:     border,
		Background:       t.Background,
		BackgroundColors: background,
		Effect:           t.Effect,
		Extras:           extras,
	}, nil
}
