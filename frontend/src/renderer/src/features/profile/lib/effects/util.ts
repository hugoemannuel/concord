// Contas pequenas que as cenas dividem: sorteio num intervalo, quantidade a
// partir da densidade e cores (#rrggbb → rgba/hsl, mistura).
import type { Rand } from './types'

export type RGB = [number, number, number]

export const TAU = Math.PI * 2
export const WHITE: RGB = [255, 255, 255]

/** Número em [a, b) sorteado pelo `rand`. */
export function between(rand: Rand, a: number, b: number): number {
  return a + (b - a) * rand()
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Quantidade de elementos: base × densidade, no mínimo 1 e no máximo `max`. */
export function countFor(base: number, density: number, max: number): number {
  const d = Number.isFinite(density) ? density : 1
  return clamp(Math.round(base * d), 1, max)
}

/** Área de um cartão, em px²: até aqui a quantidade é a de sempre. */
const CARD_AREA = 300 * 450
const MAX_AREA_BOOST = 2.5

/**
 * Como countFor, mas área maior (o fundo do app) ganha mais elementos para não
 * ficar ralo, sem nunca passar do mesmo teto `max`.
 */
export function countForArea(base: number, density: number, max: number, w: number, h: number): number {
  const boost = clamp((w * h) / CARD_AREA, 1, MAX_AREA_BOOST)
  return countFor(base * boost, density, max)
}

/** #rrggbb → [r, g, b]; cor inválida vira branco. */
export function hexRgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1, 7), 16)
  if (!/^#[0-9a-f]{6}$/i.test(hex) || Number.isNaN(n)) return [...WHITE]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mistura linear de duas cores (t = 0 → a, t = 1 → b). */
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function rgba(c: RGB, alpha: number): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`
}

function hueOf(r: number, g: number, b: number, max: number, d: number): number {
  if (max === r) return ((g - b) / d + (g < b ? 6 : 0)) * 60
  if (max === g) return ((b - r) / d + 2) * 60
  return ((r - g) / d + 4) * 60
}

/** [r, g, b] → [matiz em graus, saturação %, luminosidade %]. */
export function hsl(c: RGB): RGB {
  const [r, g, b] = [c[0] / 255, c[1] / 255, c[2] / 255]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l * 100]
  const s = d / (1 - Math.abs(2 * l - 1))
  return [hueOf(r, g, b, max, d), s * 100, l * 100]
}

/** Resto sempre positivo (índice de anel com número negativo). */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}
