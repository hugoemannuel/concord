import { secondColor } from '../../profile/lib/effectLook'
import { effectDef, type ProfileTheme } from '../../profile/lib/profileTheme'

// Regras do editor de tema (Configurações → Perfis → Aparência): que opções
// aparecem para cada borda/fundo/efeito e como trocar de efeito.

export const BORDER_COLOR_LABELS: Record<string, string[]> = {
  solid: ['Cor da borda'],
  neon: ['Cor do neon'],
  gradient: ['Cor inicial', 'Cor final']
}

export const BACKGROUND_COLOR_LABELS: Record<string, string[]> = {
  solid: ['Cor do fundo'],
  gradient: ['Cor principal', 'Cor de destaque']
}

/** Troca o efeito; cor e direção voltam ao automático (cada efeito tem as suas). */
export function withEffect(theme: ProfileTheme, effect: string): ProfileTheme {
  return { ...theme, effect, effect_color: '', effect_color2: '', effect_direction: 'default' }
}

/** "Usar a cor original": volta à cor de sempre, sem mistura. */
export function withOriginalColor(theme: ProfileTheme): ProfileTheme {
  return { ...theme, effect_color: '', effect_color2: '', effect_palette: 'single' }
}

/** O que o efeito expõe em "Mais opções" e na mistura de cor. */
export function effectTuning(theme: ProfileTheme): {
  size: boolean
  glow: boolean
  palette: boolean
  directions: readonly string[]
  color2: string
} {
  const def = effectDef(theme.effect)
  return {
    size: def.size,
    glow: def.glow,
    palette: def.palette,
    directions: def.directions.length ? ['default', ...def.directions] : [],
    color2: theme.effect_color2 || secondColor(theme.effect_color || def.color || '#ffffff')
  }
}

/** Rótulo do brilho (0 = o efeito sem brilho a mais). */
export function glowLabel(value: number): string {
  return value === 0 ? 'Desligado' : `${value}%`
}

/** O que mostrar no painel do efeito escolhido. */
export function effectOptions(theme: ProfileTheme): {
  tunable: boolean
  color: string | null
} {
  const def = effectDef(theme.effect)
  return {
    tunable: def.kind !== 'none',
    color: def.color === null ? null : theme.effect_color || def.color
  }
}

/** A borda tem espessura e animação para escolher? */
export const borderTunable = (theme: ProfileTheme): boolean => theme.border !== 'none'

/** Rótulo de um nível de 1–100 (quantidade/velocidade). */
export function levelLabel(value: number): string {
  if (value < 35) return 'Baixa'
  if (value <= 65) return 'Média'
  return 'Alta'
}
