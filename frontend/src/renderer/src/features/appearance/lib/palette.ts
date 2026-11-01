// Gera a paleta inteira de um tema próprio (todos os tokens de assets/theme.css)
// a partir de poucas escolhas: destaque, fundos (sólidos ou degradês), texto,
// realce, bordas, brilho e vidro. Os tokens que faltam (hover, bordas, texto
// apagado, status) são derivados, e tudo que é texto é empurrado até passar AA
// (4.5:1) em todos os fundos onde aparece, inclusive em cada parada dos degradês.
// Puro, sem DOM. Ver docs/adr/0040-aparencia-personalizada.md e 0041.

import type { ThemeToken } from '../../settings/lib/themes'
import { ensureContrast, flatten, luminance, mix, withAlpha } from './colorMath'
import type { FillSpec } from './gradient'
import { fillSpec, planSurfaces, RULES, type Scheme, type SchemeRules, type SurfacePlan } from './paletteSurfaces'
import { fillStops, type Gradient, type PaletteInput } from './themeInput'

export type { Scheme } from './paletteSurfaces'

export type PaletteField = 'accent' | 'background' | 'sidebar' | 'card' | 'text' | 'textMuted' | 'highlight'

export interface PaletteFills {
  /** Fundo principal (.bg-primary), barra lateral (.bg-secondary), cartões e menus. */
  primary: FillSpec
  secondary: FillSpec
  surface: FillSpec
  /** Botões e seleção na cor de destaque (.bg-brand) e o hover deles. */
  brand: FillSpec
  brandHover: FillSpec
  /** A janela atrás dos painéis de vidro (null = sem vidro). */
  window: FillSpec | null
}

export interface Palette {
  scheme: Scheme
  tokens: Record<ThemeToken, string>
  fills: PaletteFills
  /** Os fundos opacos, para quem pede menos transparência (só com vidro). */
  opaque: { tokens: Partial<Record<ThemeToken, string>>; primary: FillSpec; secondary: FillSpec } | null
  /** Desfoque dos painéis de vidro, em px (0 = sem). */
  blur: number
  /** Cores das bolhas do fundo animado (só com brilho). */
  hero: [string, string, string, string] | null
  /** Escolhas que precisaram mudar para o texto ficar legível. */
  adjusted: PaletteField[]
}

/** Alvo com folga sobre o AA (4.5) para o arredondamento do hex não derrubar. */
const TEXT_TARGET = 4.6
const INDICATOR_TARGET = 3.1
const CUSTOM_BORDERS: [number, number, number] = [0.3, 0.5, 0.85]
const MAX_BLUR = 20

/** Escuro quando o branco contrasta mais que o preto (virada em luminância ≈ 0,18). */
export function schemeOf(background: string): Scheme {
  return luminance(background) <= 0.179 ? 'dark' : 'light'
}

/** Fundos + os véus de hover/ativo/selecionado por cima deles. */
function withStates(effective: string[], states: string[]): string[] {
  return [...effective, ...effective.flatMap((bg) => states.map((s) => flatten(s, bg)))]
}

/** Véus de hover/ativo/selecionado; com realce, o selecionado ganha a cor dele. */
function overlays(neutral: string, highlight: string, rules: SchemeRules): [string, string, string] {
  const [hover, active, selected] = rules.overlays.map((a) => withAlpha(neutral, a))
  if (!highlight) return [hover, active, selected]
  // O véu do realce escurece (ou clareia) até o texto extremo passar por cima dele puro.
  const opposite = rules.extreme === '#ffffff' ? '#000000' : '#ffffff'
  const tint = ensureContrast(highlight, [rules.extreme], TEXT_TARGET + 1, opposite)
  return [hover, active, withAlpha(tint, rules.overlays[2] + 0.06)]
}

/** Texto apagado: rumo ao fundo a partir do normal, ou da cor escolhida. */
function mutedTones(normal: string, muted: string, background: string): [string, string, string] {
  if (!muted) return [mix(normal, background, 0.28), mix(normal, background, 0.38), mix(normal, background, 0.45)]
  return [muted, mix(muted, background, 0.12), mix(muted, background, 0.24)]
}

/** Texto: o escolhido e os tons mais apagados, todos AA. */
function textTokens(
  normal: string,
  input: PaletteInput,
  background: string,
  rules: SchemeRules,
  backgrounds: string[]
): Record<string, string> {
  const fit = (c: string): string => ensureContrast(c, backgrounds, TEXT_TARGET, rules.extreme)
  const strong = fit(mix(normal, rules.extreme, 0.5))
  const [secondary, muted, faint] = mutedTones(normal, input.textMuted, background).map(fit)
  return {
    'text-strong': strong,
    'text-normal': normal,
    'text-secondary': secondary,
    'text-muted': muted,
    'text-faint': faint,
    'interactive-normal': muted,
    'interactive-hover': normal,
    'interactive-active': strong,
    'interactive-muted': mix(normal, background, 0.7),
    'scrollbar-thumb': mix(normal, background, 0.5),
    'scrollbar-thumb-hover': mix(normal, background, 0.3)
  }
}

/** Cada parada do destaque escurecida até o texto branco por cima passar AA. */
function brandStops(input: PaletteInput): string[] {
  return fillStops(input, 'accent').map((c) => ensureContrast(c, ['#ffffff'], TEXT_TARGET, '#000000'))
}

function accentTokens(input: PaletteInput, brand: string, rules: SchemeRules, backgrounds: string[]): Record<string, string> {
  const fit = (c: string, target = TEXT_TARGET): string => ensureContrast(c, backgrounds, target, rules.extreme)
  const { status } = rules
  return {
    brand,
    'brand-hover': mix(brand, '#000000', 0.18),
    'text-brand': fit(input.accent),
    'text-link': fit(input.highlight || status.link),
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

const sameStops = (a: string[], b: string[]): boolean => a.length === b.length && a.every((c, i) => c === b[i])

function adjustedFields(
  input: PaletteInput,
  plan: SurfacePlan,
  brand: string[],
  tokens: Record<string, string>
): PaletteField[] {
  const changed: Record<PaletteField, boolean> = {
    accent: !sameStops(brand, fillStops(input, 'accent')),
    background: !sameStops(plan.stops.background, fillStops(input, 'background')),
    sidebar: !sameStops(plan.stops.sidebar, fillStops(input, 'sidebar')),
    card: !sameStops(plan.stops.card, fillStops(input, 'card')),
    text: tokens['text-normal'] !== input.text,
    textMuted: input.textMuted !== '' && tokens['text-secondary'] !== input.textMuted,
    highlight: input.highlight !== '' && tokens['text-link'] !== input.highlight
  }
  return (Object.keys(changed) as PaletteField[]).filter((field) => changed[field])
}

const low = (c: string): string => c.toLowerCase()

function lowerGradients(gradients: PaletteInput['gradients']): PaletteInput['gradients'] {
  const out: PaletteInput['gradients'] = {}
  for (const [field, g] of Object.entries(gradients) as Array<[keyof PaletteInput['gradients'], Gradient]>) {
    if (g) out[field] = { ...g, colors: g.colors.map(low) }
  }
  return out
}

/** Só os campos da paleta (o rascunho traz nome e afins junto), cores em minúsculas. */
function lower(raw: PaletteInput): PaletteInput {
  return {
    accent: low(raw.accent),
    background: low(raw.background),
    sidebar: low(raw.sidebar),
    card: low(raw.card),
    text: low(raw.text),
    glow: low(raw.glow),
    gradients: lowerGradients(raw.gradients ?? {}),
    highlight: low(raw.highlight ?? ''),
    textMuted: low(raw.textMuted ?? ''),
    border: low(raw.border ?? ''),
    glowStrength: raw.glowStrength ?? 100,
    glass: raw.glass ?? 0
  }
}

function brandFills(input: PaletteInput, stops: string[]): Pick<PaletteFills, 'brand' | 'brandHover'> {
  const gradient = input.gradients.accent
  const shape = { type: gradient?.type ?? 'linear', angle: gradient?.angle ?? 135 }
  return {
    brand: { ...shape, stops },
    brandHover: { ...shape, stops: stops.map((c) => mix(c, '#000000', 0.18)) }
  }
}

function borderTokens(input: PaletteInput, neutral: string, rules: SchemeRules): Record<string, string> {
  const [color, alphas] = input.border ? [input.border, CUSTOM_BORDERS] : [neutral, rules.borders]
  return {
    'border-subtle': withAlpha(color, alphas[0]),
    'border-normal': withAlpha(color, alphas[1]),
    'border-strong': withAlpha(color, alphas[2])
  }
}

function heroOf(input: PaletteInput, glow: string): Palette['hero'] {
  if (!glow) return null
  return [glow, input.accent, input.highlight || glow, mix(glow, input.accent, 0.5)]
}

function opaqueOf(input: PaletteInput, plan: SurfacePlan): NonNullable<Palette['opaque']> {
  return {
    tokens: plan.base,
    primary: fillSpec(input, 'background', plan.stops.background),
    secondary: fillSpec(input, 'sidebar', plan.stops.sidebar)
  }
}

export function buildPalette(raw: PaletteInput): Palette {
  const input = lower(raw)
  const scheme = schemeOf(input.background)
  const rules = RULES[scheme]
  // Brilho só no escuro: a vinheta do fundo animado é preta.
  const glow = scheme === 'dark' ? input.glow : ''
  const plan = planSurfaces(input, rules, scheme, glow)
  const background = plan.base['bg-primary']
  // Os véus de hover/selecionado saem do texto; o texto precisa passar por cima deles.
  const firstPass = ensureContrast(input.text, plan.effective, TEXT_TARGET, rules.extreme)
  const neutral = mix(firstPass, background, 0.45)
  const [hover, active, selected] = overlays(neutral, input.highlight, rules)
  const textBackgrounds = withStates(plan.effective, [hover, active, selected])
  const normal = ensureContrast(input.text, textBackgrounds, TEXT_TARGET, rules.extreme)
  const brand = brandStops(input)
  const tokens = {
    ...plan.solid,
    'bg-hover': hover,
    'bg-active': active,
    'bg-selected': selected,
    scrim: rules.scrim,
    ...borderTokens(input, neutral, rules),
    ...textTokens(normal, input, background, rules, textBackgrounds),
    ...accentTokens(input, brand[0], rules, plan.effective),
    fg: rules.extreme,
    shadow: rules.shadow,
    'decor-opacity': glow ? String(input.glowStrength / 100) : '0'
  } as Record<ThemeToken, string>
  return {
    scheme,
    tokens,
    fills: { ...plan.fills, ...brandFills(input, brand) },
    opaque: input.glass > 0 ? opaqueOf(input, plan) : null,
    blur: input.glass > 0 ? Math.round((MAX_BLUR * input.glass) / 100) : 0,
    hero: heroOf(input, glow),
    adjusted: adjustedFields(input, plan, brand, tokens)
  }
}
