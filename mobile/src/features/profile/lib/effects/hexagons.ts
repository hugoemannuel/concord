// Hexágonos neon: uma colmeia apagada onde ondas de luz acendem as bordas. O
// tamanho da célula cresce com a área para o total nunca passar do teto (tela
// cheia custa o mesmo que o cartão), e cada brilho é um traço só.
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { countFor, hexRgb, mix, rgba, TAU, WHITE } from './util'

/** Faixas de brilho: células da mesma faixa saem no mesmo traço. */
const BUCKETS = 4
const MIN_R = 15
const CORNERS = Array.from({ length: 6 }, (_, i) => {
  const a = (TAU / 6) * i + TAU / 12
  return [Math.cos(a), Math.sin(a)] as const
})

export interface Hex {
  x: number
  y: number
  phase: number
  light: number
}

export interface HexagonsState {
  w: number
  h: number
  r: number
  t: number
  wave: number
  cells: Hex[]
  grid: string
  shades: string[]
  fill: string
}

/** Raio que faz caber até `cap` células em w×h (a área de um hexágono é ~2,6 r²). */
export function hexRadius(w: number, h: number, cap: number): number {
  return Math.max(MIN_R, Math.sqrt((w * h) / (cap * 2.6)) * 1.12)
}

function layout(w: number, h: number, r: number, rand: Rand, cap: number): Hex[] {
  const dx = Math.sqrt(3) * r
  const dy = 1.5 * r
  const cells: Hex[] = []
  for (let row = 0; row * dy < h + r && cells.length < cap; row++) {
    const shift = row % 2 ? dx / 2 : 0
    for (let col = 0; col * dx - shift < w + r && cells.length < cap; col++) {
      cells.push({ x: col * dx - shift, y: row * dy, phase: rand() * 0.9, light: 0 })
    }
  }
  return cells
}

function traceHex(ctx: Ctx, c: Hex, r: number): void {
  ctx.moveTo(c.x + CORNERS[0][0] * r, c.y + CORNERS[0][1] * r)
  for (let i = 1; i < 6; i++) ctx.lineTo(c.x + CORNERS[i][0] * r, c.y + CORNERS[i][1] * r)
  ctx.closePath()
}

/** Número de onda: sempre cabe mais de uma onda de luz na área, grande ou pequena. */
export function waveNumber(w: number, h: number): number {
  return TAU / (Math.hypot(w, h) * 0.6)
}

function lightOf(c: Hex, t: number, k: number): number {
  const wave = Math.sin(t * 0.9 + (c.x + c.y * 0.6) * k + c.phase)
  const on = Math.max(0, wave)
  return on * on * on
}

function bucketOf(light: number): number {
  return Math.min(BUCKETS - 1, Math.floor(light * BUCKETS))
}

function drawBucket(ctx: Ctx, s: HexagonsState, b: number): void {
  ctx.strokeStyle = s.shades[b]
  ctx.lineWidth = 1 + b * 0.5
  ctx.beginPath()
  for (const c of s.cells) if (c.light > 0.08 && bucketOf(c.light) === b) traceHex(ctx, c, s.r)
  ctx.stroke()
}

export const hexagonsScene: Scene<HexagonsState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): HexagonsState {
    const color = hexRgb(p.color)
    const cap = countFor(70, p.density, 150)
    const r = hexRadius(w, h, cap)
    return {
      w,
      h,
      r,
      t: 0,
      wave: waveNumber(w, h),
      cells: layout(w, h, r, rand, cap),
      grid: rgba(color, 0.1),
      shades: Array.from({ length: BUCKETS }, (_, b) =>
        rgba(mix(color, WHITE, b * 0.14), 0.3 + b * 0.22)
      ),
      fill: rgba(color, 0.16)
    }
  },
  step(s: HexagonsState, dt: number): void {
    s.t = (s.t + dt) % 1000
    for (const c of s.cells) c.light = lightOf(c, s.t, s.wave)
  },
  draw(ctx: Ctx, s: HexagonsState): void {
    ctx.strokeStyle = s.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const c of s.cells) traceHex(ctx, c, s.r)
    ctx.stroke()
    ctx.fillStyle = s.fill
    ctx.beginPath()
    for (const c of s.cells) if (c.light > 0.75) traceHex(ctx, c, s.r)
    ctx.fill()
    for (let b = 0; b < BUCKETS; b++) drawBucket(ctx, s, b)
  }
}
