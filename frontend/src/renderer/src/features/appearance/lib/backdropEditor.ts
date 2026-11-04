// A seção "Efeitos" do editor de tema usa os mesmos controles do efeito do
// cartão de perfil (settings EffectControls): aqui o fundo do tema vira o
// formato do perfil e volta. Puro.

import type { ProfileEffectLook } from '../../profile/lib/effectLook'
import { DEFAULT_PROFILE_THEME, type ProfileTheme } from '../../profile/lib/profileTheme'
import type { ThemeBackdrop } from './themeInput'

type EffectFields = Pick<
  ThemeBackdrop,
  | 'effect'
  | 'effectDensity'
  | 'effectSpeed'
  | 'effectColor'
  | 'effectSize'
  | 'effectDirection'
  | 'effectOpacity'
  | 'effectPalette'
  | 'effectColor2'
  | 'effectArea'
  | 'effectGlow'
>

type LookFields = Omit<EffectFields, 'effect' | 'effectDensity' | 'effectSpeed' | 'effectColor'>

/** Os ajustes do fundo do tema no formato do perfil. */
export function lookOfBackdrop(b: LookFields): ProfileEffectLook {
  return {
    effect_size: b.effectSize,
    effect_direction: b.effectDirection,
    effect_opacity: b.effectOpacity,
    effect_palette: b.effectPalette,
    effect_color2: b.effectColor2,
    effect_area: b.effectArea,
    effect_glow: b.effectGlow
  }
}

/** O caminho de volta: os ajustes do perfil nos campos do tema. */
export function backdropOfLook(l: ProfileEffectLook): LookFields {
  return {
    effectSize: l.effect_size,
    effectDirection: l.effect_direction,
    effectOpacity: l.effect_opacity,
    effectPalette: l.effect_palette,
    effectColor2: l.effect_color2,
    effectArea: l.effect_area,
    effectGlow: l.effect_glow
  }
}

export function toProfileEffect(b: EffectFields): ProfileTheme {
  return {
    ...DEFAULT_PROFILE_THEME,
    effect: b.effect,
    effect_density: b.effectDensity,
    effect_speed: b.effectSpeed,
    effect_color: b.effectColor,
    ...lookOfBackdrop(b)
  }
}

export function fromProfileEffect(p: ProfileTheme): EffectFields {
  return {
    effect: p.effect,
    effectDensity: p.effect_density,
    effectSpeed: p.effect_speed,
    effectColor: p.effect_color,
    ...backdropOfLook(p)
  }
}
