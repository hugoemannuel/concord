package apptheme

import (
	"slices"
	"strings"
)

// Campos da v2 (ADR 0041): degradês, cores extras, brilho, vidro e forma.
// Tema gravado pela v1 não tem nenhum deles: ganha os padrões que reproduzem a
// v1 (o vidro da v1 vinha junto com o brilho).

const (
	V1Glass           = 40
	RadiusMax         = 200
	maxGradientColors = 2
)

var (
	fillFields    = []string{"accent", "background", "sidebar", "card"}
	gradientTypes = []string{"linear", "radial"}
	densities     = []string{"compact", "normal", "comfortable"}
	fonts         = []string{"outfit", "system", "serif", "mono"}
)

// Gradient: a cor base do campo + 1 ou 2 cores. Angle em graus (0–360).
type Gradient struct {
	Type   string   `json:"type"`
	Angle  int      `json:"angle"`
	Colors []string `json:"colors"`
}

func intOr(p *int, def int) *int {
	if p != nil {
		return p
	}
	return &def
}

func strOr(s, def string) string {
	if s != "" {
		return s
	}
	return def
}

// withDefaults completa o que faltar (tema da v1) sem validar.
func withDefaults(t Theme) Theme {
	if t.Gradients == nil {
		t.Gradients = map[string]Gradient{}
	}
	glass := 0
	if t.Glow != "" {
		glass = V1Glass
	}
	t.GlowStrength = intOr(t.GlowStrength, 100)
	t.Glass = intOr(t.Glass, glass)
	t.Radius = intOr(t.Radius, 100)
	t.Density = strOr(t.Density, "normal")
	t.Font = strOr(t.Font, "outfit")
	return t
}

// Migrate devolve a lista lida do banco no formato v2 (padrões no que faltar).
func Migrate(in []Theme) []Theme {
	out := make([]Theme, len(in))
	for i, t := range in {
		out[i] = withDefaults(t)
	}
	return out
}

func optionalColor(c *string) bool {
	*c = strings.ToLower(*c)
	return *c == "" || hexPattern.MatchString(*c)
}

func validGradient(field string, g Gradient) (Gradient, bool) {
	ok := slices.Contains(fillFields, field) && slices.Contains(gradientTypes, g.Type) &&
		g.Angle >= 0 && g.Angle <= 360 && len(g.Colors) >= 1 && len(g.Colors) <= maxGradientColors
	colors := make([]string, len(g.Colors))
	for i, c := range g.Colors {
		colors[i] = strings.ToLower(c)
		ok = ok && hexPattern.MatchString(colors[i])
	}
	g.Colors = colors
	return g, ok
}

func inRange(p *int, max int) bool {
	return *p >= 0 && *p <= max
}

// normalizeStyle confere e limpa os campos v2 (já com os padrões).
func normalizeStyle(t Theme) (Theme, bool) {
	t = withDefaults(t)
	ok := optionalColor(&t.Highlight) && optionalColor(&t.TextMuted) && optionalColor(&t.Border)
	ok = ok && inRange(t.GlowStrength, 100) && inRange(t.Glass, 100) && inRange(t.Radius, RadiusMax)
	ok = ok && slices.Contains(densities, t.Density) && slices.Contains(fonts, t.Font)
	gradients := make(map[string]Gradient, len(t.Gradients))
	for field, g := range t.Gradients {
		clean, valid := validGradient(field, g)
		ok = ok && valid
		gradients[field] = clean
	}
	t.Gradients = gradients
	return t, ok
}
