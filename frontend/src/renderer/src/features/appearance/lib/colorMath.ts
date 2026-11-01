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
 * O fundo mais escuro e o mais claro: o contraste com os do meio nunca é menor
 * que com um dos dois quando o texto fica fora da faixa (o único caso que passa).
 * Deixa o ajuste barato mesmo com dezenas de fundos (degradês, vidro, véus).
 */
export function luminanceExtremes(backgrounds: string[]): string[] {
  if (backgrounds.length <= 2) return backgrounds
  let darkest = backgrounds[0]
  let lightest = backgrounds[0]
  let low = luminance(darkest)
  let high = low
  for (const bg of backgrounds) {
    const l = luminance(bg)
    if (l < low) [darkest, low] = [bg, l]
    if (l > high) [lightest, high] = [bg, l]
  }
  return [darkest, lightest]
}

/**
 * A cor mais parecida com `color`, indo na direção de `toward` (branco ou
 * preto), que passa `target` em todos os fundos. Sem como passar: o extremo.
 */
export function ensureContrast(color: string, backgrounds: string[], target: number, toward: string): string {
  const edges = luminanceExtremes(backgrounds)
  return smallestStep(color, toward, (c) => minRatio(c, edges) >= target) ?? toward
}

/** Puxa a luminância para dentro de [min, max] (rumo ao preto ou ao branco). */
export function clampLuminance(hex: string, { min = 0, max = 1 }: { min?: number; max?: number }): string {
  if (luminance(hex) > max) return smallestStep(hex, '#000000', (c) => luminance(c) <= max) ?? '#000000'
  if (luminance(hex) < min) return smallestStep(hex, '#ffffff', (c) => luminance(c) >= min) ?? '#ffffff'
  return hex.toLowerCase()
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const sector = Math.floor(h / 60) % 6
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x]
  ][sector]
  return toHex(rgb.map((v) => (v + m) * 255))
}

/** Gira o matiz em `degrees`, mantendo saturação e luminosidade (HSL). */
export function rotateHue(hex: string, degrees: number): string {
  const [h, s, l] = toHsl(hex)
  return fromHsl((h + degrees + 360) % 360, s, l)
}
