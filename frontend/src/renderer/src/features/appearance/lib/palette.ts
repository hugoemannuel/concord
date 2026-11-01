// Gera a paleta inteira de um tema próprio (todos os tokens de assets/theme.css)
// a partir de poucas escolhas: destaque, fundos, texto e brilho. Os tokens que
// faltam (hover, bordas, texto apagado, status) são derivados, e tudo que é texto
// é empurrado até passar AA (4.5:1) nos fundos onde aparece. Puro, sem DOM.
// Ver docs/adr/0040-aparencia-personalizada.md.

import type { ThemeToken } from '../../settings/lib/themes'
import { clampLuminance, ensureContrast, flatten, luminance, mix, withAlpha } from './colorMath'

/** O que a pessoa escolhe no editor. Cores em #rrggbb; brilho '' = sem. */
export interface PaletteInput {
  accent: string
  background: string
  sidebar: string
  card: string
  text: string
  glow: string
}

export type PaletteField = 'accent' | 'background' | 'sidebar' | 'card' | 'text'
export type Scheme = 'dark' | 'light'

export interface Palette {
  scheme: Scheme
  tokens: Record<ThemeToken, string>
  /** Cores das bolhas do fundo animado (só com brilho). */
  hero: [string, string, string, string] | null
  /** Escolhas que precisaram mudar para o texto ficar legível. */
  adjusted: PaletteField[]
}

/** Alvo com folga sobre o AA (4.5) para o arredondamento do hex não derrubar. */
const TEXT_TARGET = 4.6
const INDICATOR_TARGET = 3.1

interface SchemeRules {
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
const RULES: Record<Scheme, SchemeRules> = {
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

/** Com brilho, os painéis deixam passar o fundo animado (como no Roxo neon). */
const GLASS: Partial<Record<ThemeToken, number>> = {
  'bg-tertiary': 0.85,
  'bg-secondary': 0.82,
  'bg-primary': 0.88,
  'bg-members': 0.7
}

/** Bolhas a 35% e vinheta preta: os dois extremos do que fica atrás do vidro. */
const GLOW_STRENGTH = 0.35

/** Escuro quando o branco contrasta mais que o preto (virada em luminância ≈ 0,18). */
export function schemeOf(background: string): Scheme {
  return luminance(background) <= 0.179 ? 'dark' : 'light'
}

interface Surfaces {
  solid: Partial<Record<ThemeToken, string>>
  /** Fundos reais onde o texto pode cair (com e sem brilho atrás). */
  effective: string[]
}

function baseSurfaces(input: PaletteInput, rules: SchemeRules, scheme: Scheme): Record<string, string> {
  const background = clampLuminance(input.background, rules.range)
  const sidebar = clampLuminance(input.sidebar, rules.range)
  const card = clampLuminance(input.card, rules.range)
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

/** Painéis (translúcidos com brilho) e os fundos reais para medir o contraste. */
function surfaces(base: Record<string, string>, glow: string): Surfaces {
  const app = base['bg-app']
  const behind = glow ? [app, mix(app, glow, GLOW_STRENGTH), mix(app, '#000000', 0.85)] : [app]
  const solid: Partial<Record<ThemeToken, string>> = {}
  const effective: string[] = []
  for (const [token, color] of Object.entries(base) as Array<[ThemeToken, string]>) {
    const alpha = glow ? GLASS[token] : undefined
    solid[token] = alpha ? withAlpha(color, alpha) : color
    if (token === 'bg-accent' || token === 'bg-app') continue
    for (const b of behind) effective.push(flatten(solid[token]!, b))
  }
  return { solid, effective }
}

/** Fundos + os véus de hover/ativo/selecionado por cima deles. */
function withStates(effective: string[], states: string[]): string[] {
  return [...effective, ...effective.flatMap((bg) => states.map((s) => flatten(s, bg)))]
}

/** Texto: o escolhido e os tons mais apagados (rumo ao fundo), todos AA. */
function textTokens(normal: string, background: string, rules: SchemeRules, backgrounds: string[]): Record<string, string> {
  const fit = (c: string): string => ensureContrast(c, backgrounds, TEXT_TARGET, rules.extreme)
  const strong = fit(mix(normal, rules.extreme, 0.5))
  const muted = fit(mix(normal, background, 0.38))
  return {
    'text-strong': strong,
    'text-normal': normal,
    'text-secondary': fit(mix(normal, background, 0.28)),
    'text-muted': muted,
    'text-faint': fit(mix(normal, background, 0.45)),
    'interactive-normal': muted,
    'interactive-hover': normal,
    'interactive-active': strong,
    'interactive-muted': mix(normal, background, 0.7),
    'scrollbar-thumb': mix(normal, background, 0.5),
    'scrollbar-thumb-hover': mix(normal, background, 0.3)
  }
}

function accentTokens(input: PaletteInput, rules: SchemeRules, backgrounds: string[]): Record<string, string> {
  const fit = (c: string, target = TEXT_TARGET): string => ensureContrast(c, backgrounds, target, rules.extreme)
  const brand = ensureContrast(input.accent, ['#ffffff'], TEXT_TARGET, '#000000')
  const { status } = rules
  return {
    brand,
    'brand-hover': mix(brand, '#000000', 0.18),
    'text-brand': fit(input.accent),
    'text-link': fit(status.link),
    'text-positive': fit(status.positive),
    'text-danger': fit(status.danger),
    'text-warning': fit(status.warning),
    green: fit(status.green, INDICATOR_TARGET),
    'green-strong': '#248046',
    'green-strong-hover': '#1a6334',
    red: fit(status.red, INDICATOR_TARGET),
    'red-strong': '#da373c',
    'red-strong-hover': '#a12d2f',
    yellow: fit(status.yellow, INDICATOR_TARGET)
  }
}

function adjustedFields(input: PaletteInput, base: Record<string, string>, tokens: Record<string, string>): PaletteField[] {
  const got: Record<PaletteField, string> = {
    accent: tokens.brand,
    background: base['bg-primary'],
    sidebar: base['bg-secondary'],
    card: base['bg-surface'],
    text: tokens['text-normal']
  }
  return (Object.keys(got) as PaletteField[]).filter((field) => got[field] !== input[field])
}

/** Só as cores (o rascunho do editor traz nome e afins junto), em minúsculas. */
function lower({ accent, background, sidebar, card, text, glow }: PaletteInput): PaletteInput {
  const l = (c: string): string => c.toLowerCase()
  return { accent: l(accent), background: l(background), sidebar: l(sidebar), card: l(card), text: l(text), glow: l(glow) }
}

export function buildPalette(raw: PaletteInput): Palette {
  const input = lower(raw)
  const scheme = schemeOf(input.background)
  const rules = RULES[scheme]
  // Brilho só no escuro: a vinheta do fundo animado é preta.
  const glow = scheme === 'dark' ? input.glow : ''
  const base = baseSurfaces(input, rules, scheme)
  const background = base['bg-primary']
  const { solid, effective } = surfaces(base, glow)
  // Os véus de hover/selecionado saem do texto; o texto precisa passar por cima deles.
  const firstPass = ensureContrast(input.text, effective, TEXT_TARGET, rules.extreme)
  const neutral = mix(firstPass, background, 0.45)
  const [hover, active, selected] = rules.overlays.map((a) => withAlpha(neutral, a))
  const textBackgrounds = withStates(effective, [hover, active, selected])
  const normal = ensureContrast(input.text, textBackgrounds, TEXT_TARGET, rules.extreme)
  const tokens = {
    ...solid,
    'bg-hover': hover,
    'bg-active': active,
    'bg-selected': selected,
    scrim: rules.scrim,
    'border-subtle': withAlpha(neutral, rules.borders[0]),
    'border-normal': withAlpha(neutral, rules.borders[1]),
    'border-strong': withAlpha(neutral, rules.borders[2]),
    ...textTokens(normal, background, rules, textBackgrounds),
    ...accentTokens(input, rules, effective),
    fg: rules.extreme,
    shadow: rules.shadow,
    'decor-opacity': glow ? '1' : '0'
  } as Record<ThemeToken, string>
  const hero: Palette['hero'] = glow ? [glow, input.accent, glow, mix(glow, input.accent, 0.5)] : null
  return { scheme, tokens, hero, adjusted: adjustedFields(input, base, tokens) }
}
