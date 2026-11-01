// O efeito animado no fundo do app (v3, ADR 0043): o tema próprio em vigor (ou o
// rascunho do editor) → a mesma descrição de efeito do cartão de perfil, para o
// mesmo motor desenhar (features/profile EffectLayer). Puro.

import { effectDef, type ProfileThemeLook } from '../../profile/lib/profileTheme'
import { densityFactor, speedFactor } from '../../profile/lib/profileThemeExtras'
import { customThemeKey, type CustomTheme } from './customThemes'
import type { ThemeBackdrop, ThemeInput } from './themeInput'

export type BackdropFx = ProfileThemeLook['fx']

/** O tema próprio que o app mostra agora: o rascunho do editor ou o escolhido. */
export function activeTheme(draft: ThemeInput | null, applied: string, themes: CustomTheme[]): ThemeInput | null {
  if (draft) return draft
  return themes.find((t) => customThemeKey(t.id) === applied) ?? null
}

/** O efeito a desenhar no fundo; null = nenhum. */
export function backdropFx(input: ThemeBackdrop | null): BackdropFx | null {
  if (!input) return null
  const def = effectDef(input.effect)
  if (def.kind === 'none') return null
  return {
    id: def.id,
    kind: def.kind,
    params: {
      density: densityFactor(input.effectDensity),
      speed: speedFactor(input.effectSpeed),
      color: input.effectColor || def.color || '#ffffff'
    }
  }
}
