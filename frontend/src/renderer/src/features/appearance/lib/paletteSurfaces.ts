// Fundos de um tema próprio: as cores (e paradas de degradê) puxadas para a
// faixa do esquema, o vidro dos painéis e a lista dos fundos reais onde o texto
// pode cair (cada parada, com e sem brilho atrás). Puro. Usado por palette.ts.

import type { ThemeToken } from '../../settings/lib/themes'
import { clampLuminance, flatten, mix, withAlpha } from './colorMath'
import type { FillSpec } from './gradient'
import { fillStops, V1_GLASS, type FillField, type PaletteInput } from './themeInput'

export type Scheme = 'dark' | 'light'

export interface SchemeRules {
  /** Para onde o texto vai quando falta contraste. */
  extreme: string
  range: { min?: number; max?: number }
  tertiaryShade: number
  overlays: [number, number, number]
  borders: [number, number, number]
  scrim: string
  shadow: string
  status: Record<'link' | 'positive' | 'danger' | 'warning' | 'green' | 'red' | 'yellow', string>
}

// Status e véus vêm do Discord Escuro/Claro (assets/theme.css).
export const RULES: Record<Scheme, SchemeRules> = {
  dark: {
    extreme: '#ffffff',
    range: { max: 0.12 },
    tertiaryShade: 0.2,
    overlays: [0.122, 0.161, 0.2],
    borders: [0.122, 0.2, 0.439],
    scrim: 'rgba(0, 0, 0, 0.722)',
    shadow: 'rgba(0, 0, 0, 0.36)',
    status: {
      link: '#4d96ee',
      positive: '#5eb479',
      danger: '#ffa09b',
      warning: '#fcb529',
      green: '#45a366',
      red: '#da3e44',
      yellow: '#f0b232'
    }
  },
  light: {
    extreme: '#000000',
    range: { min: 0.5 },
    tertiaryShade: 0.035,
    overlays: [0.122, 0.161, 0.239],
    borders: [0.278, 0.4, 0.522],
    scrim: 'rgba(0, 0, 0, 0.522)',
    shadow: 'rgba(0, 0, 0, 0.16)',
    status: {
      link: '#006dd4',
      positive: '#01713a',
      danger: '#b92733',
      warning: '#945300',
      green: '#24934e',
      red: '#da373c',
      yellow: '#af7615'
    }
  }
}

/** Opacidade de cada painel com o vidro da v1 (V1_GLASS); o vidro escala daí. */
const GLASS_AT_V1: Partial<Record<ThemeToken, number>> = {
  'bg-tertiary': 0.85,
  'bg-secondary': 0.82,
  'bg-primary': 0.88,
  'bg-members': 0.7
}
const MIN_GLASS_ALPHA = 0.35

/** Bolhas a 35% e vinheta preta: os dois extremos do que fica atrás do vidro. */
const GLOW_MIX = 0.35

/** Opacidade do painel com o vidro `glass` (0–100); undefined = opaco. */
export function glassAlpha(token: ThemeToken, glass: number): number | undefined {
  const atV1 = GLASS_AT_V1[token]
  if (!atV1 || glass <= 0) return undefined
  const alpha = 1 - ((1 - atV1) * glass) / V1_GLASS
  return Math.max(MIN_GLASS_ALPHA, Math.round(alpha * 1000) / 1000)
}

type SurfaceField = Exclude<FillField, 'accent'>

export interface SurfacePlan {
  /** Os fundos opacos (o que vale sem transparência). */
  base: Record<string, string>
  /** Os tokens de fundo (translúcidos com vidro). */
  solid: Partial<Record<ThemeToken, string>>
  /** Fundos reais onde o texto pode cair. */
  effective: string[]
  /** Paradas já puxadas para a faixa do esquema. */
  stops: Record<SurfaceField, string[]>
  fills: { primary: FillSpec; secondary: FillSpec; surface: FillSpec; window: FillSpec | null }
}

function baseSurfaces(stops: SurfacePlan['stops'], rules: SchemeRules, scheme: Scheme): Record<string, string> {
  const [background] = stops.background
  const [sidebar] = stops.sidebar
  const [card] = stops.card
  const tertiary = mix(sidebar, '#000000', rules.tertiaryShade)
  const members = mix(background, card, 0.6)
  return {
    'bg-app': tertiary,
    'bg-tertiary': tertiary,
    'bg-secondary': sidebar,
    'bg-primary': background,
    'bg-members': members,
    'bg-surface': card,
    'bg-floating': scheme === 'dark' ? mix(card, '#ffffff', 0.02) : card,
    'bg-modal': card,
    'bg-input': members,
    'bg-accent': mix(card, rules.extreme, 0.08)
  }
}

/** O que fica atrás dos painéis: a janela e, com brilho, as bolhas e a vinheta. */
function behindColors(windows: string[], glow: string, strength: number): string[] {
  if (!glow) return windows
  const t = (GLOW_MIX * strength) / 100
  return windows.flatMap((w) => [w, mix(w, glow, t), mix(w, '#000000', 0.85)])
}

/** As paradas de um token: as do degradê do campo dele ou só a cor dele. */
const TOKEN_STOPS: Partial<Record<ThemeToken, SurfaceField>> = {
  'bg-primary': 'background',
  'bg-secondary': 'sidebar',
  'bg-surface': 'card',
  'bg-floating': 'card',
  'bg-modal': 'card'
}

function tokenColors(token: ThemeToken, color: string, stops: SurfacePlan['stops']): string[] {
  const field = TOKEN_STOPS[token]
  return field ? [color, ...stops[field].slice(1)] : [color]
}

export function fillSpec(input: PaletteInput, field: FillField, stops: string[]): FillSpec {
  const gradient = input.gradients[field]
  return { type: gradient?.type ?? 'linear', angle: gradient?.angle ?? 180, stops }
}

const translucent = (stops: string[], alpha: number | undefined): string[] =>
  alpha ? stops.map((c) => withAlpha(c, alpha)) : stops

/** Fundos (com vidro e degradês) e a lista dos fundos reais para medir o contraste. */
export function planSurfaces(input: PaletteInput, rules: SchemeRules, scheme: Scheme, glow: string): SurfacePlan {
  const clamp = (field: SurfaceField): string[] => fillStops(input, field).map((c) => clampLuminance(c, rules.range))
  const glassy = input.glass > 0
  const stops = { background: clamp('background'), sidebar: clamp('sidebar'), card: clamp('card') }
  // Com vidro, cor e imagem translúcidas somadas deixariam o painel quase opaco:
  // o degradê do fundo principal vai para a janela (atrás de tudo) e os painéis
  // translúcidos (fundo principal e barra lateral) ficam só com a cor base.
  const panel = glassy ? { ...stops, background: stops.background.slice(0, 1), sidebar: stops.sidebar.slice(0, 1) } : stops
  const base = baseSurfaces(stops, rules, scheme)
  // Com vidro, a janela mostra o fundo principal (com o degradê dele) atrás dos painéis.
  const windows = glassy ? [base['bg-app'], ...stops.background] : [base['bg-app']]
  const behind = behindColors(windows, glow, input.glowStrength)
  const solid: Partial<Record<ThemeToken, string>> = {}
  const effective: string[] = []
  for (const [token, color] of Object.entries(base) as Array<[ThemeToken, string]>) {
    const alpha = glassAlpha(token, input.glass)
    solid[token] = translucent([color], alpha)[0]
    if (token === 'bg-accent' || token === 'bg-app') continue
    for (const c of translucent(tokenColors(token, color, panel), alpha)) {
      for (const b of behind) effective.push(flatten(c, b))
    }
  }
  // Sem transparência (prefers-reduced-transparency) os painéis ficam opacos.
  if (glassy) for (const [token, color] of Object.entries(base)) if (token !== 'bg-accent') effective.push(color)
  const fills = {
    primary: fillSpec(input, 'background', translucent(panel.background, glassAlpha('bg-primary', input.glass))),
    secondary: fillSpec(input, 'sidebar', translucent(panel.sidebar, glassAlpha('bg-secondary', input.glass))),
    surface: fillSpec(input, 'card', stops.card),
    window: glassy ? fillSpec(input, 'background', stops.background) : null
  }
  return { base, solid, effective: [...new Set(effective)], stops, fills }
}
