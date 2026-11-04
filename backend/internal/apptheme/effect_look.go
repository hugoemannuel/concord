package apptheme

import (
	"slices"

	"gin-quickstart/backend/internal/profiletheme"
)

// Ajustes do efeito no fundo do app (ADR 0054): os mesmos do cartão de perfil
// (profiletheme.EffectLook), em camelCase como o resto do tema. Tema salvo antes
// deles ganha os padrões, que desenham igual.

func effectLookDefaults(t Theme) Theme {
	d := profiletheme.DefaultEffectLook()
	t.EffectSize = intOr(t.EffectSize, d.EffectSize)
	t.EffectDirection = strOr(t.EffectDirection, d.EffectDirection)
	t.EffectOpacity = intOr(t.EffectOpacity, d.EffectOpacity)
	t.EffectPalette = strOr(t.EffectPalette, d.EffectPalette)
	t.EffectArea = strOr(t.EffectArea, d.EffectArea)
	t.EffectGlow = intOr(t.EffectGlow, d.EffectGlow)
	return t
}

// validEffectLook confere os ajustes (já com os padrões) e arruma a segunda cor.
func validEffectLook(t *Theme) bool {
	levels := level(t.EffectSize) && level(t.EffectOpacity) && inRange(t.EffectGlow, 100)
	lists := slices.Contains(profiletheme.EffectDirections, t.EffectDirection) &&
		slices.Contains(profiletheme.EffectPalettes, t.EffectPalette) &&
		slices.Contains(profiletheme.EffectAreas, t.EffectArea)
	return levels && lists && optionalColor(&t.EffectColor2)
}
