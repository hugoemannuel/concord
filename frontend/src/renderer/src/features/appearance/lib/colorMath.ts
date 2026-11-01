// Contas de cor do gerador de tema (lib/palette.ts): misturar, transparência,
// luminância e "empurrar até passar no contraste". Tudo em hex #rrggbb. Puro.

import { contrastRatio, parseColor, relativeLuminance } from '../../../shared/lib/contrast'

const HEX6 = /^#[0-9a-f]{6}$/i

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX6.test(value)
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/** `a` → `b` na proporção `t` (0 = a, 1 = b), em sRGB. */
export function mix(a: string, b: string, t: number): string {
  const ca = channels(a)
  const cb = channels(b)
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t))
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Cor (hex ou rgba) por cima de um fundo opaco → hex opaco. */
export function flatten(color: string, base: string): string {
  const c = parseColor(color)!
  if (c.a >= 1) return toHex([c.r, c.g, c.b])
  const [r, g, b] = channels(base)
  return toHex([c.r * c.a + r * (1 - c.a), c.g * c.a + g * (1 - c.a), c.b * c.a + b * (1 - c.a)])
}

export function luminance(hex: string): number {
  return relativeLuminance(parseColor(hex)!)
}

/** Menor t em [0, 1] com ok(mix(color, toward, t)); null se nem o extremo serve. */
function smallestStep(color: string, toward: string, ok: (c: string) => boolean): string | null {
  if (ok(color)) return color
  if (!ok(toward)) return null
  let lo = 0
  let hi = 1
  for (let i = 0; i < 18; i++) {
    const t = (lo + hi) / 2
    if (ok(mix(color, toward, t))) hi = t
    else lo = t
  }
  return mix(color, toward, hi)
}

const minRatio = (color: string, backgrounds: string[]): number =>
  Math.min(...backgrounds.map((bg) => contrastRatio(color, bg)))

/**
 * A cor mais parecida com `color`, indo na direção de `toward` (branco ou
 * preto), que passa `target` em todos os fundos. Sem como passar: o extremo.
 */
export function ensureContrast(color: string, backgrounds: string[], target: number, toward: string): string {
  return smallestStep(color, toward, (c) => minRatio(c, backgrounds) >= target) ?? toward
}

/** Puxa a luminância para dentro de [min, max] (rumo ao preto ou ao branco). */
export function clampLuminance(hex: string, { min = 0, max = 1 }: { min?: number; max?: number }): string {
  if (luminance(hex) > max) return smallestStep(hex, '#000000', (c) => luminance(c) <= max) ?? '#000000'
  if (luminance(hex) < min) return smallestStep(hex, '#ffffff', (c) => luminance(c) >= min) ?? '#ffffff'
  return hex.toLowerCase()
}
