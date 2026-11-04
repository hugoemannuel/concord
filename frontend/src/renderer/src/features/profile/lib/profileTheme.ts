import type { CSSProperties } from 'react'
import { effectDef, PROFILE_EFFECTS } from './effectCatalog'
import { fxLook, type FxLook } from './effectLook'
import { pickInk, type Ink } from './profileInk'
import { PRIDE_PALETTE, prideGradient } from './profilePride'
import type { EffectParams } from './effects/types'
import {
  DEFAULT_EXTRAS,
  effectParams,
  extrasClasses,
  extrasVars,
  resolveExtras,
  type ProfileThemeExtras
} from './profileThemeExtras'

// Tema do cartão de perfil: borda, fundo do corpo (cor ou degradê, como o
// tema de perfil do Nitro), um efeito por cima e as opções finas
// (profileThemeExtras.ts). Os IDs são os do backend (internal/profiletheme);
// profileTheme.test.ts confere as listas.

export { effectDef, PROFILE_EFFECTS }

export interface ProfileTheme extends ProfileThemeExtras {
  border: string
  border_colors: string[]
  background: string
  background_colors: string[]
  effect: string
}

export const DEFAULT_PROFILE_THEME: ProfileTheme = {
  border: 'none',
  border_colors: [],
  background: 'default',
  background_colors: [],
  effect: 'none',
  ...DEFAULT_EXTRAS
}

/**
 * Fundo do cartão sem tema (recorta o avatar e a bolinha de status): o
 * --bg-floating do tema de cor do app (assets/theme.css).
 */
export const CARD_BG = 'var(--bg-floating)'

export const PROFILE_BORDERS = [
  { id: 'none', label: 'Nenhuma', colors: 0 },
  { id: 'solid', label: 'Cor sólida', colors: 1 },
  { id: 'neon', label: 'Neon', colors: 1 },
  { id: 'rainbow', label: 'Arco-íris', colors: 0 },
  { id: 'gradient', label: 'Degradê', colors: 2 }
] as const

export const PROFILE_BACKGROUNDS = [
  { id: 'default', label: 'Padrão', colors: 0 },
  { id: 'solid', label: 'Cor sólida', colors: 1 },
  { id: 'gradient', label: 'Degradê', colors: 2 },
  { id: 'pride', label: 'Arco-íris do orgulho', colors: 0 }
] as const

const COLOR = /^#[0-9a-f]{6}$/i
const BORDER_FALLBACK = ['#8b5cf6', '#ec4899']
const BACKGROUND_FALLBACK = ['#5865f2', '#1e1f22']

function cleanColors(raw: unknown, want: number): string[] | null {
  const list = Array.isArray(raw) ? raw : []
  const colors = list
    .filter((c): c is string => typeof c === 'string' && COLOR.test(c))
    .map((c) => c.toLowerCase())
  return colors.length === want && list.length === want ? colors : null
}

/**
 * Tema seguro para desenhar: cada parte inválida (ID desconhecido, cor fora do
 * formato, número de cores errado) volta ao padrão sozinha. Cor nunca vira CSS
 * sem passar por aqui.
 */
export function resolveProfileTheme(raw?: Partial<ProfileTheme> | null): ProfileTheme {
  const border = PROFILE_BORDERS.find((b) => b.id === raw?.border)
  const borderColors = border ? cleanColors(raw?.border_colors, border.colors) : null
  const background = PROFILE_BACKGROUNDS.find((b) => b.id === raw?.background)
  const backgroundColors = background
    ? cleanColors(raw?.background_colors, background.colors)
    : null
  const effect = PROFILE_EFFECTS.find((e) => e.id === raw?.effect)
  return {
    border: border && borderColors ? border.id : 'none',
    border_colors: border && borderColors ? borderColors : [],
    background: background && backgroundColors ? background.id : 'default',
    background_colors: background && backgroundColors ? backgroundColors : [],
    effect: effect?.id ?? 'none',
    ...resolveExtras(raw)
  }
}

/** Troca a borda mantendo as cores que servem e completando as que faltam. */
export function withBorder(theme: ProfileTheme, id: string): ProfileTheme {
  const def = PROFILE_BORDERS.find((b) => b.id === id)
  if (!def) return theme
  const colors = [...theme.border_colors, ...BORDER_FALLBACK.slice(theme.border_colors.length)]
  return { ...theme, border: id, border_colors: colors.slice(0, def.colors) }
}

/** Troca o fundo mantendo as cores que servem e completando as que faltam. */
export function withBackground(theme: ProfileTheme, id: string): ProfileTheme {
  const def = PROFILE_BACKGROUNDS.find((b) => b.id === id)
  if (!def) return theme
  const colors = [
    ...theme.background_colors,
    ...BACKGROUND_FALLBACK.slice(theme.background_colors.length)
  ]
  return { ...theme, background: id, background_colors: colors.slice(0, def.colors) }
}

export interface ProfileThemeLook {
  /** Classes do cartão (borda, animação, textura, texto escuro). */
  className: string
  /** Variáveis que o CSS lê (assets/profileTheme.css). */
  style: CSSProperties
  /** Cores reais do fundo (no pride, as faixas escurecidas): contraste de cargos e níveis. */
  palette: string[]
  /** Cor do fundo logo abaixo do banner: o anel do avatar e o recorte do status. */
  surface: string
  ink: Ink
  /** O efeito por cima e com que parâmetros (ProfileCardFrame desenha). */
  fx: { id: string; kind: 'none' | 'css' | 'canvas'; params: EffectParams; look: FxLook }
}

/** Fundo do corpo: sempre uma imagem (no "background" em camadas a cor só vai na última). */
function bodyBackground(theme: ProfileTheme, surface: string): string {
  const bg = theme.background_colors
  if (theme.background === 'pride') return prideGradient(theme.background_angle)
  return theme.background === 'gradient'
    ? `linear-gradient(${theme.background_angle}deg, ${bg[0]}, ${bg[1]})`
    : `linear-gradient(${surface}, ${surface})`
}

/** Cores que o texto precisa vencer: as do fundo (as faixas, no pride). */
function backgroundPalette(theme: ProfileTheme): string[] {
  return theme.background === 'pride' ? PRIDE_PALETTE : theme.background_colors
}

function themeVars(theme: ProfileTheme, surface: string): Record<string, string> {
  const [b1, b2] = theme.border_colors
  const vars: Record<string, string> = { '--pt-bg': bodyBackground(theme, surface) }
  if (b1) vars['--pt-b1'] = b1
  if (b2) vars['--pt-b2'] = b2
  vars['--pt-fx'] = b1 ?? theme.background_colors[1] ?? '#c4b5fd'
  return { ...vars, ...extrasVars(theme) }
}

/** Sem fundo próprio o texto é o do tema do app; com fundo, o de mais contraste. */
function inkClass(bg: string[], ink: Ink): string[] {
  if (!bg.length) return []
  return [ink === 'dark' ? 'pt-ink-dark' : 'pt-ink-light']
}

/** Como desenhar o cartão com o tema (já resolvido). */
export function profileThemeLook(theme: ProfileTheme): ProfileThemeLook {
  const bg = backgroundPalette(theme)
  const surface = bg[0] ?? CARD_BG
  const ink = bg.length ? pickInk(bg) : 'light'
  const className = [
    'profile-frame',
    `pt-border-${theme.border}`,
    ...extrasClasses(theme, theme.border),
    ...inkClass(bg, ink)
  ].join(' ')
  const def = effectDef(theme.effect)
  const params = effectParams(theme, def.color ?? '#ffffff')
  const fx = { id: def.id, kind: def.kind, params, look: fxLook(def, theme, params.color) }
  return {
    className,
    style: themeVars(theme, surface) as CSSProperties,
    palette: bg,
    surface,
    ink,
    fx
  }
}

/** Mesmo tema (compara já resolvido). */
export function sameTheme(a: ProfileTheme, b: ProfileTheme): boolean {
  return JSON.stringify(resolveProfileTheme(a)) === JSON.stringify(resolveProfileTheme(b))
}
