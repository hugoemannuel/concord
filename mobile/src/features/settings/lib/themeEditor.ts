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

/** Troca o efeito; a cor escolhida volta ao automático (cada efeito tem a sua). */
export function withEffect(theme: ProfileTheme, effect: string): ProfileTheme {
  return { ...theme, effect, effect_color: '', effect_color2: '', effect_direction: 'default' }
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
