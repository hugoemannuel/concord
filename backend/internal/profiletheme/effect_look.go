package profiletheme

// EffectLook são os ajustes de como o efeito aparece (ADR 0054): tamanho,
// direção, opacidade, mistura de cor, área e brilho. Saem no JSON ao lado dos
// outros extras e cabem na mesma coluna JSONB (sem migration). Zero/vazio =
// padrão, que desenha igual a antes deles.
type EffectLook struct {
	EffectSize      int    `json:"effect_size"`
	EffectDirection string `json:"effect_direction"`
	EffectOpacity   int    `json:"effect_opacity"`
	EffectPalette   string `json:"effect_palette"`
	// EffectColor2: a segunda cor da mistura "duo"; "" = derivada da principal.
	EffectColor2 string `json:"effect_color2"`
	EffectArea   string `json:"effect_area"`
	EffectGlow   int    `json:"effect_glow"`
}

// EffectDirections: "default" é o sentido de sempre de cada efeito.
var EffectDirections = []string{"default", "up", "down", "left", "right"}

var EffectPalettes = []string{"single", "duo", "rainbow"}

// EffectAreas: o cartão inteiro ou só o banner (no fundo do app, só o topo).
var EffectAreas = []string{"full", "banner"}

const (
	DefaultEffectOpacity = 100
	// DefaultEffectGlow: 0 = sem brilho além do que o efeito já tem.
	DefaultEffectGlow = 0
)

func DefaultEffectLook() EffectLook {
	return EffectLook{
		EffectSize:      DefaultLevel,
		EffectDirection: EffectDirections[0],
		EffectOpacity:   DefaultEffectOpacity,
		EffectPalette:   EffectPalettes[0],
		EffectColor2:    "",
		EffectArea:      EffectAreas[0],
		EffectGlow:      DefaultEffectGlow,
	}
}

// validateEffectLook devolve os ajustes arrumados (zeros viram o padrão).
func validateEffectLook(l EffectLook) (EffectLook, error) {
	var errs [7]error
	out := EffectLook{}
	out.EffectSize, errs[0] = number(l.EffectSize, 100, DefaultLevel, "tamanho do efeito")
	out.EffectDirection, errs[1] = option(l.EffectDirection, EffectDirections, "direção do efeito")
	out.EffectOpacity, errs[2] = number(l.EffectOpacity, 100, DefaultEffectOpacity, "opacidade do efeito")
	out.EffectPalette, errs[3] = option(l.EffectPalette, EffectPalettes, "mistura de cor do efeito")
	out.EffectColor2, errs[4] = effectColor(l.EffectColor2)
	out.EffectArea, errs[5] = option(l.EffectArea, EffectAreas, "área do efeito")
	out.EffectGlow, errs[6] = number(l.EffectGlow, 100, DefaultEffectGlow, "brilho do efeito")
	for _, err := range errs {
		if err != nil {
			return EffectLook{}, err
		}
	}
	return out, nil
}
