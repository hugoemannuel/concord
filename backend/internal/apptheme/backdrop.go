package apptheme

import (
	"regexp"
	"slices"
	"strings"
)

// Campos da v3 (ADR 0043): um efeito animado no fundo do app (os mesmos do
// cartão de perfil) e uma imagem de fundo enviada pela pessoa, com escurecer e
// desfocar. Tema salvo antes deles fica sem efeito e sem imagem.

const (
	DefaultImageDim = 40
	MaxImageDim     = 90
	MaxImageBlur    = 20
	defaultLevel    = 50
)

// Os ids dos efeitos do cartão de perfil (frontend features/profile/lib/profileTheme.ts).
var effects = []string{
	"none", "particles", "sparkles", "snow", "fire", "matrix", "glitch",
	"storm", "galaxy", "aurora", "hearts", "confetti", "synthwave", "rain",
}

// Só imagem enviada pelo próprio app (image.go): nada de URL de fora nem texto
// que escape do url() do CSS.
var imagePattern = regexp.MustCompile(`^` + imagePath + `([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`)

func backdropDefaults(t Theme) Theme {
	t.Effect = strOr(t.Effect, "none")
	t.EffectDensity = intOr(t.EffectDensity, defaultLevel)
	t.EffectSpeed = intOr(t.EffectSpeed, defaultLevel)
	t.ImageDim = intOr(t.ImageDim, DefaultImageDim)
	t.ImageBlur = intOr(t.ImageBlur, 0)
	return t
}

func level(p *int) bool {
	return *p >= 1 && *p <= 100
}

// normalizeBackdrop confere e limpa os campos v3 (já com os padrões).
func normalizeBackdrop(t Theme) (Theme, bool) {
	t = backdropDefaults(t)
	ok := slices.Contains(effects, t.Effect) && level(t.EffectDensity) && level(t.EffectSpeed)
	ok = ok && optionalColor(&t.EffectColor)
	t.Image = strings.TrimSpace(t.Image)
	ok = ok && (t.Image == "" || imagePattern.MatchString(t.Image))
	ok = ok && inRange(t.ImageDim, MaxImageDim) && inRange(t.ImageBlur, MaxImageBlur)
	return t, ok
}

// imageIDs: os arquivos de imagem que os temas usam (a faxina não apaga esses).
func imageIDs(themes []Theme) map[string]bool {
	ids := map[string]bool{}
	for _, t := range themes {
		if m := imagePattern.FindStringSubmatch(t.Image); m != nil {
			ids[m[1]] = true
		}
	}
	return ids
}
