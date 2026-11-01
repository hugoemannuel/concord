// A seção "Efeitos" do editor de tema usa os mesmos controles do efeito do
// cartão de perfil (settings EffectControls): aqui o fundo do tema vira o
// formato do perfil e volta. Puro.

import { DEFAULT_PROFILE_THEME, type ProfileTheme } from '../../profile/lib/profileTheme'
import type { ThemeBackdrop } from './themeInput'

type EffectFields = Pick<ThemeBackdrop, 'effect' | 'effectDensity' | 'effectSpeed' | 'effectColor'>

export function toProfileEffect(b: EffectFields): ProfileTheme {
  return {
    ...DEFAULT_PROFILE_THEME,
    effect: b.effect,
    effect_density: b.effectDensity,
    effect_speed: b.effectSpeed,
    effect_color: b.effectColor
  }
}

export function fromProfileEffect(p: ProfileTheme): EffectFields {
  return {
    effect: p.effect,
    effectDensity: p.effect_density,
    effectSpeed: p.effect_speed,
    effectColor: p.effect_color
  }
}
