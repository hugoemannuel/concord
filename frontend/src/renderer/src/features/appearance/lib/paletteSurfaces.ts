// Fundos de um tema próprio: as cores (e paradas de degradê) puxadas para a
// faixa do esquema, o vidro dos painéis e a lista dos fundos reais onde o texto
// pode cair (cada parada, com e sem brilho, efeito ou imagem atrás). Puro.
// Usado por palette.ts.

import { contrastRatio } from '../../../shared/lib/contrast'
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

/**
 * Opacidade de cada painel quando o fundo precisa aparecer (brilho a 100%,
 * efeito animado ou imagem): sem isso os painéis opacos escondem tudo (o
 * brilho "não fazia nada" sem vidro). Medido no app: o brilho fica evidente e
 * o texto, legível.
 */
const SEE_THROUGH: Partial<Record<ThemeToken, number>> = {
  'bg-tertiary': 0.66,
  'bg-secondary': 0.66,
  'bg-primary': 0.72,
  'bg-members': 0.55
}

/** Com imagem de fundo os painéis abrem mais (o véu mínimo garante o contraste por cima dela). */
const IMAGE_SEE_THROUGH: Partial<Record<ThemeToken, number>> = {
  'bg-tertiary': 0.55,
  'bg-secondary': 0.55,
  'bg-primary': 0.6,
  'bg-members': 0.45
}

/** Pico das bolhas do brilho nos temas próprios (assets/themeDecor.css: até 80%). */
export const GLOW_PEAK = 0.8
/** Opacidade da camada do efeito animado (features/appearance ThemeBackdrop). */
export const EFFECT_PEAK = 0.7
/** Véu mínimo por cima da imagem de fundo (o texto passa AA até sobre branco puro). */
export const MIN_IMAGE_DIM = 35
/** Vinheta preta das bordas do fundo animado (a 50% nos temas próprios). */
const VIGNETTE = 0.45

const hasEffect = (input: PaletteInput): boolean => !!input.effect && input.effect !== 'none'

/** Quanto do fundo precisa aparecer (0–100): o brilho pela intensidade; efeito e imagem, tudo. */
export function seeThrough(input: PaletteInput, glow: string): number {
  if (input.image || hasEffect(input)) return 100
  return glow ? input.glowStrength : 0
}

/** Véu por cima da imagem de fundo: escuro no tema escuro, claro no claro. */
export function imageVeil(input: PaletteInput, scheme: Scheme): { color: string; alpha: number } | null {
  if (!input.image) return null
  const dim = Math.max(MIN_IMAGE_DIM, input.imageDim ?? MIN_IMAGE_DIM)
  return { color: scheme === 'dark' ? '#000000' : '#ffffff', alpha: dim / 100 }
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

/**
 * Folga que o texto extremo (branco no escuro, preto no claro) precisa ter
 * sobre o pior fundo: o texto da pessoa, o apagado e os links são empurrados
 * rumo a ele e ainda têm os véus de hover por cima.
 */
const FEASIBLE = 6
const ALPHA_STEP = 0.05

/**
 * A opacidade do painel sobe (de 5 em 5%) até o texto extremo passar com folga
 * em todas as cores dele sobre tudo que pode ficar atrás: um tema claro com
 * partículas escuras ou uma foto escura atrás fica mais opaco, sozinho.
 */
export function readableAlpha(colors: string[], alpha: number | undefined, behind: string[], extreme: string): number | undefined {
  let a = alpha
  const passes = (x: number): boolean =>
    colors.every((c) => behind.every((b) => contrastRatio(extreme, flatten(withAlpha(c, x), b)) >= FEASIBLE))
  while (a !== undefined && a < 1 && !passes(a)) a = a + ALPHA_STEP < 1 ? round3(a + ALPHA_STEP) : undefined
  return a
}

/** Opacidade do painel com o vidro e o que precisa aparecer atrás; undefined = opaco. */
export function panelAlpha(token: ThemeToken, glass: number, see: number, image = false): number | undefined {
  const fromGlass = glassAlpha(token, glass) ?? 1
  const target = (image ? IMAGE_SEE_THROUGH : SEE_THROUGH)[token]
  const fromSee = target && see > 0 ? round3(1 - ((1 - target) * see) / 100) : 1
  const alpha = Math.min(fromGlass, fromSee)
  return alpha < 1 ? alpha : undefined
}

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

/** O que fica atrás dos painéis: a janela e, por cima dela, as bolhas, a vinheta e o efeito. */
export interface Behind {
  windows: string[]
  /** Cores das bolhas do brilho (null = sem brilho). */
  hero: string[] | null
  strength: number
  effect: boolean
}

function behindColors({ windows, hero, strength, effect }: Behind): string[] {
  const t = (GLOW_PEAK * strength) / 100
  const glow = hero ? windows.flatMap((w) => [...hero.map((h) => mix(w, h, t)), mix(w, '#000000', VIGNETTE)]) : []
  const fx = effect ? windows.flatMap((w) => [mix(w, '#ffffff', EFFECT_PEAK), mix(w, '#000000', EFFECT_PEAK)]) : []
  return [...windows, ...glow, ...fx]
}

/** A janela: a imagem (com o véu, do branco ao preto), o fundo principal (com vidro) ou só o --bg-app. */
function windowColors(app: string, background: string[], translucent: boolean, veil: ReturnType<typeof imageVeil>): string[] {
  if (veil) return [mix('#ffffff', veil.color, veil.alpha), mix('#000000', veil.color, veil.alpha)]
  return translucent ? [app, ...background] : [app]
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

/** Os tokens de fundo (translúcidos onde pedem) e cada fundo real: cada cor do painel sobre cada coisa atrás. */
function realSurfaces(
  base: Record<string, string>,
  panel: SurfacePlan['stops'],
  alphaOf: (token: ThemeToken) => number | undefined,
  behind: string[]
): { solid: Partial<Record<ThemeToken, string>>; effective: string[] } {
  const solid: Partial<Record<ThemeToken, string>> = {}
  const effective: string[] = []
  for (const [token, color] of Object.entries(base) as Array<[ThemeToken, string]>) {
    const alpha = alphaOf(token)
    solid[token] = translucent([color], alpha)[0]
    if (token === 'bg-accent' || token === 'bg-app') continue
    for (const c of translucent(tokenColors(token, color, panel), alpha)) {
      for (const b of behind) effective.push(flatten(c, b))
    }
  }
  return { solid, effective }
}

/** Fundos (com vidro e degradês) e a lista dos fundos reais para medir o contraste. */
export function planSurfaces(input: PaletteInput, rules: SchemeRules, scheme: Scheme, hero: string[] | null): SurfacePlan {
  const clamp = (field: SurfaceField): string[] => fillStops(input, field).map((c) => clampLuminance(c, rules.range))
  const see = seeThrough(input, hero ? hero[0] : '')
  const glassy = input.glass > 0 || see > 0
  const stops = { background: clamp('background'), sidebar: clamp('sidebar'), card: clamp('card') }
  // Com vidro, cor e imagem translúcidas somadas deixariam o painel quase opaco:
  // o degradê do fundo principal vai para a janela (atrás de tudo) e os painéis
  // translúcidos (fundo principal e barra lateral) ficam só com a cor base.
  const panel = glassy ? { ...stops, background: stops.background.slice(0, 1), sidebar: stops.sidebar.slice(0, 1) } : stops
  const base = baseSurfaces(stops, rules, scheme)
  // Com vidro, a janela mostra o fundo principal (com o degradê dele) atrás dos painéis.
  const windows = windowColors(base['bg-app'], stops.background, glassy, imageVeil(input, scheme))
  const behind = behindColors({ windows, hero, strength: input.glowStrength, effect: hasEffect(input) })
  const alphas = new Map<ThemeToken, number | undefined>()
  for (const [token, color] of Object.entries(base) as Array<[ThemeToken, string]>) {
    const wanted = panelAlpha(token, input.glass, see, !!input.image)
    alphas.set(token, readableAlpha(tokenColors(token, color, panel), wanted, behind, rules.extreme))
  }
  const alphaOf = (token: ThemeToken): number | undefined => alphas.get(token)
  const { solid, effective } = realSurfaces(base, panel, alphaOf, behind)
  // Sem transparência (prefers-reduced-transparency) os painéis ficam opacos.
  if (glassy) for (const [token, color] of Object.entries(base)) if (token !== 'bg-accent') effective.push(color)
  const fills = {
    primary: fillSpec(input, 'background', translucent(panel.background, alphaOf('bg-primary'))),
    secondary: fillSpec(input, 'sidebar', translucent(panel.sidebar, alphaOf('bg-secondary'))),
    surface: fillSpec(input, 'card', stops.card),
    window: glassy ? fillSpec(input, 'background', stops.background) : null
  }
  return { base, solid, effective: [...new Set(effective)], stops, fills }
}
