// Lê um tema próprio vindo de fora (servidor ou localStorage) e migra os
// formatos antigos (v1: só as seis cores; v2: sem o fundo da v3): o que faltar ganha o padrão que reproduz a v1
// (withDefaults); extra inválido cai no padrão sem perder o tema. Puro.

import { isHexColor } from './colorMath'
import { PROFILE_EFFECTS } from '../../profile/lib/profileTheme'
import { isThemeImage } from './themeImage'
import {
  DENSITIES,
  FILL_FIELDS,
  FONTS,
  IMAGE_BLUR_MAX,
  IMAGE_DIM_MAX,
  MAX_GRADIENT_COLORS,
  RADIUS_MAX,
  withDefaults,
  type Gradient,
  type PaletteInput,
  type ThemeInput
} from './themeInput'

type Raw = Record<string, unknown>

const COLOR_FIELDS = ['accent', 'background', 'sidebar', 'card', 'text'] as const

const lower = (v: unknown): string => (v as string).toLowerCase()

/** Inteiro em [0, max]; outra coisa → undefined (fica o padrão). */
function intIn(value: unknown, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : undefined
}

/** '' ou #rrggbb; outra coisa → ''. */
const optionalColor = (value: unknown): string => (isHexColor(value) ? lower(value) : '')

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined
}

export function parseGradient(raw: unknown): Gradient | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Raw
  const colors = Array.isArray(r.colors) ? r.colors : []
  if (colors.length < 1 || colors.length > MAX_GRADIENT_COLORS || !colors.every(isHexColor)) return undefined
  return {
    type: oneOf(r.type, ['linear', 'radial'] as const) ?? 'linear',
    angle: intIn(r.angle, 360) ?? 180,
    colors: colors.map(lower)
  }
}

function parseGradients(raw: unknown): PaletteInput['gradients'] {
  const out: PaletteInput['gradients'] = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const field of FILL_FIELDS) {
    const gradient = parseGradient((raw as Raw)[field])
    if (gradient) out[field] = gradient
  }
  return out
}

/** Inteiro em [1, 100] (quantidade e velocidade do efeito); outra coisa → undefined. */
const level = (value: unknown): number | undefined => (intIn(value, 100) ? (value as number) : undefined)

const EFFECT_IDS = PROFILE_EFFECTS.map((e) => e.id)

/** Os campos v3 (fundo) que vieram válidos. */
function backdrop(r: Raw): Partial<ThemeInput> {
  return {
    effect: oneOf(r.effect, EFFECT_IDS),
    effectDensity: level(r.effectDensity),
    effectSpeed: level(r.effectSpeed),
    effectColor: optionalColor(r.effectColor),
    image: isThemeImage(r.image) ? r.image : '',
    imageDim: intIn(r.imageDim, IMAGE_DIM_MAX),
    imageBlur: intIn(r.imageBlur, IMAGE_BLUR_MAX)
  }
}

/** Os campos v2 e v3 que vieram válidos (o resto fica no padrão de withDefaults). */
function extras(r: Raw): Partial<ThemeInput> {
  const picked: Partial<ThemeInput> = {
    gradients: parseGradients(r.gradients),
    highlight: optionalColor(r.highlight),
    textMuted: optionalColor(r.textMuted),
    border: optionalColor(r.border),
    glowStrength: intIn(r.glowStrength, 100),
    glass: intIn(r.glass, 100),
    radius: intIn(r.radius, RADIUS_MAX),
    density: oneOf(r.density, DENSITIES),
    font: oneOf(r.font, FONTS),
    ...backdrop(r)
  }
  return Object.fromEntries(Object.entries(picked).filter(([, v]) => v !== undefined))
}

/** As cores e efeitos de um tema salvo (v1 ou v2); null se as cores básicas não servem. */
export function parseThemeInput(raw: unknown): ThemeInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Raw
  if (!COLOR_FIELDS.every((f) => isHexColor(r[f]))) return null
  if (r.glow !== '' && !isHexColor(r.glow)) return null
  return withDefaults({
    accent: lower(r.accent),
    background: lower(r.background),
    sidebar: lower(r.sidebar),
    card: lower(r.card),
    text: lower(r.text),
    glow: lower(r.glow),
    ...extras(r)
  })
}
