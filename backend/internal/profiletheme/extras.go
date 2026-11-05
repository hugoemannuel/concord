package profiletheme

import (
	"fmt"
	"slices"
	"strings"
)

// Extras são as opções finas do tema: cor, quantidade e velocidade do efeito,
// animação e espessura da borda, ângulo do degradê e textura do fundo. Ficam
// numa coluna JSONB só (profile_theme_extras) e saem no JSON ao lado dos
// campos antigos. Zero/vazio = padrão: cliente antigo, que não manda nada
// disso, continua válido.
type Extras struct {
	// EffectColor: "" = a cor de sempre do efeito.
	EffectColor     string `json:"effect_color"`
	EffectDensity   int    `json:"effect_density"`
	EffectSpeed     int    `json:"effect_speed"`
	BorderAnimation string `json:"border_animation"`
	BorderWidth     int    `json:"border_width"`
	BackgroundAngle int    `json:"background_angle"`
	Texture         string `json:"texture"`
	// EffectLook sai no JSON no mesmo nível (effect_look.go).
	EffectLook
}

// BorderAnimations: "default" é o jeito de sempre (neon pulsa, arco-íris gira).
var BorderAnimations = []string{"default", "static", "pulse", "spin"}

var Textures = []string{"none", "grain", "dots", "lines", "grid"}

const (
	// DefaultLevel: meio da escala 1–100 da quantidade e da velocidade.
	DefaultLevel       = 50
	DefaultBorderWidth = 2
	MaxBorderWidth     = 6
	// DefaultAngle: o degradê em pé de antes (de cima para baixo).
	DefaultAngle = 180
)

func DefaultExtras() Extras {
	return Extras{
		EffectColor:     "",
		EffectDensity:   DefaultLevel,
		EffectSpeed:     DefaultLevel,
		BorderAnimation: BorderAnimations[0],
		BorderWidth:     DefaultBorderWidth,
		BackgroundAngle: DefaultAngle,
		Texture:         Textures[0],
		EffectLook:      DefaultEffectLook(),
	}
}

// number confere v em [1, max]; 0 vira def.
func number(v, max, def int, what string) (int, error) {
	if v == 0 {
		return def, nil
	}
	if v < 1 || v > max {
		return 0, invalid(fmt.Sprintf("%s fora do intervalo", what))
	}
	return v, nil
}

// option confere v na lista; "" vira o primeiro (o padrão).
func option(v string, list []string, what string) (string, error) {
	if v == "" {
		return list[0], nil
	}
	if !slices.Contains(list, v) {
		return "", invalid(what + " desconhecida")
	}
	return v, nil
}

func effectColor(c string) (string, error) {
	if c == "" {
		return "", nil
	}
	if !colorPattern.MatchString(c) {
		return "", invalid("cor do efeito inválida")
	}
	return strings.ToLower(c), nil
}

// validateExtras devolve os extras arrumados (zeros viram o padrão).
func validateExtras(e Extras) (Extras, error) {
	var errs [8]error
	out := Extras{}
	out.EffectColor, errs[0] = effectColor(e.EffectColor)
	out.EffectDensity, errs[1] = number(e.EffectDensity, 100, DefaultLevel, "quantidade do efeito")
	out.EffectSpeed, errs[2] = number(e.EffectSpeed, 100, DefaultLevel, "velocidade do efeito")
	out.BorderAnimation, errs[3] = option(e.BorderAnimation, BorderAnimations, "animação da borda")
	out.BorderWidth, errs[4] = number(e.BorderWidth, MaxBorderWidth, DefaultBorderWidth, "espessura da borda")
	out.BackgroundAngle, errs[5] = number(e.BackgroundAngle, 360, DefaultAngle, "ângulo do degradê")
	out.Texture, errs[6] = option(e.Texture, Textures, "textura")
	out.EffectLook, errs[7] = validateEffectLook(e.EffectLook)
	for _, err := range errs {
		if err != nil {
			return Extras{}, err
		}
	}
	return out, nil
}

// Filled é o que sai do banco: zeros viram o padrão e, se algo salvo não vale
// mais, volta tudo ao padrão (nunca quebra a leitura do usuário).
func (e Extras) Filled() Extras {
	out, err := validateExtras(e)
	if err != nil {
		return DefaultExtras()
	}
	return out
}
