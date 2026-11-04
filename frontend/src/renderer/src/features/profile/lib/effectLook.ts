// Os ajustes de como o efeito aparece (backend internal/profiletheme/effect_look.go):
// tamanho, direção, opacidade, mistura de cor, área e brilho. Zero/vazio = padrão,
// que desenha igual a antes deles. Puro.
import type { EffectDef } from './effectCatalog'
import { hexRgb, hsl, mix, type RGB } from './effects/util'
import type { Direction, Flow } from './effects/view'

export interface ProfileEffectLook {
  /** 1–100 (50 = padrão). */
  effect_size: number
  effect_direction: string
  /** 1–100 (100 = padrão). */
  effect_opacity: number
  effect_palette: string
  /** A segunda cor da mistura; '' = derivada da principal. */
  effect_color2: string
  effect_area: string
  /** 0–100 (0 = padrão). */
  effect_glow: number
}

export const DEFAULT_EFFECT_LOOK: ProfileEffectLook = {
  effect_size: 50,
  effect_direction: 'default',
  effect_opacity: 100,
  effect_palette: 'single',
  effect_color2: '',
  effect_area: 'full',
  effect_glow: 0
}

export const EFFECT_DIRECTIONS = [
  { id: 'default', label: 'Padrão' },
  { id: 'up', label: 'Para cima' },
  { id: 'down', label: 'Para baixo' },
  { id: 'left', label: 'Para a esquerda' },
  { id: 'right', label: 'Para a direita' }
] as const

export const EFFECT_PALETTES = [
  { id: 'single', label: 'Cor única' },
  { id: 'duo', label: 'Duas cores' },
  { id: 'rainbow', label: 'Arco-íris' }
] as const

export const EFFECT_AREAS = [{ id: 'full' }, { id: 'banner' }] as const

const COLOR = /^#[0-9a-f]{6}$/i
/** Cor branca/cinza não tem matiz para girar: a segunda cor é esta. */
const GREY_PAIR = '#7cc4ff'
const SECOND_HUE_TURN = 50

function inRange(raw: unknown, min: number, def: number): number {
  return Number.isInteger(raw) && (raw as number) >= min && (raw as number) <= 100
    ? (raw as number)
    : def
}

function pick(raw: unknown, list: readonly { id: string }[]): string {
  return list.find((o) => o.id === raw)?.id ?? list[0].id
}

/** Ajustes seguros para desenhar: cada um inválido volta ao padrão sozinho. */
export function resolveEffectLook(raw?: Partial<ProfileEffectLook> | null): ProfileEffectLook {
  const color2 = raw?.effect_color2
  return {
    effect_size: inRange(raw?.effect_size, 1, DEFAULT_EFFECT_LOOK.effect_size),
    effect_direction: pick(raw?.effect_direction, EFFECT_DIRECTIONS),
    effect_opacity: inRange(raw?.effect_opacity, 1, DEFAULT_EFFECT_LOOK.effect_opacity),
    effect_palette: pick(raw?.effect_palette, EFFECT_PALETTES),
    effect_color2: typeof color2 === 'string' && COLOR.test(color2) ? color2.toLowerCase() : '',
    effect_area: pick(raw?.effect_area, EFFECT_AREAS),
    effect_glow: inRange(raw?.effect_glow, 0, DEFAULT_EFFECT_LOOK.effect_glow)
  }
}

/** Fator do tamanho (1–100 → ~0,5–2; 50 = 1). */
export function sizeFactor(value: number): number {
  return 2 ** ((value - 50) / 50)
}

function toHex(c: RGB): string {
  const part = (v: number): string => Math.round(v).toString(16).padStart(2, '0')
  return `#${part(c[0])}${part(c[1])}${part(c[2])}`
}

function hslRgb(h: number, s: number, l: number): RGB {
  const [sat, light] = [s / 100, l / 100]
  const a = sat * Math.min(light, 1 - light)
  const channel = (n: number): number => {
    const k = (n + h / 30) % 12
    return 255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  }
  return [channel(0), channel(8), channel(4)]
}

/** A segunda cor automática: a principal com o matiz girado. */
export function secondColor(color: string): string {
  const [h, s, l] = hsl(hexRgb(color))
  if (s < 15) return GREY_PAIR
  return toHex(hslRgb((h + SECOND_HUE_TURN) % 360, s, l))
}

/** Os ajustes já resolvidos para desenhar um efeito. */
export interface FxLook {
  size: number
  flow: Flow | null
  direction: Direction
  /** 0 a 1. */
  opacity: number
  palette: string
  color2: string
  area: string
  /** 0 a 1. */
  glow: number
}

function directionFor(def: EffectDef, wanted: string): Direction {
  return (def.directions as readonly string[]).includes(wanted) ? (wanted as Flow) : 'default'
}

/** Só vale o que o efeito expõe; opacidade e área valem para todos. */
export function fxLook(def: EffectDef, look: ProfileEffectLook, color: string): FxLook {
  return {
    size: def.size ? sizeFactor(look.effect_size) : 1,
    flow: def.flow,
    direction: directionFor(def, look.effect_direction),
    opacity: look.effect_opacity / 100,
    palette: def.palette ? look.effect_palette : 'single',
    color2: look.effect_color2 || secondColor(color),
    area: look.effect_area,
    glow: def.glow ? look.effect_glow / 100 : 0
  }
}

/** A cor de uma partícula de CSS na mistura; null = a de sempre. */
export function particleColor(
  palette: string,
  color: string,
  color2: string,
  i: number,
  n: number
): string | null {
  if (palette === 'rainbow') return `hsl(${Math.round((i / Math.max(1, n)) * 360)} 92% 66%)`
  if (palette !== 'duo') return null
  const t = n > 1 ? i / (n - 1) : 0
  return toHex(mix(hexRgb(color), hexRgb(color2), t))
}
