// Bandeirinhas de festa junina: cordões atravessados no alto, com a barriga do
// fio e as bandeiras balançando no vento. Paleta própria (ignora a cor).
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, countFor, TAU } from './util'

export const BUNTING_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#ec4899',
  '#a855f7',
  '#14b8a6'
]
/** Teto de bandeiras por cordão: em tela larga elas só ficam mais espaçadas. */
const MAX_FLAGS = 32
const MIN_GAP = 20

export interface Flag {
  /** Posição no cordão, de 0 a 1. */
  at: number
  color: number
  phase: number
}

export interface Cord {
  y: number
  sag: number
  flags: Flag[]
  flagW: number
  flagH: number
  phase: number
}

export interface BuntingState {
  w: number
  h: number
  t: number
  cords: Cord[]
}

function newCord(i: number, w: number, h: number, rand: Rand): Cord {
  const n = Math.min(MAX_FLAGS, Math.max(3, Math.floor(w / MIN_GAP)))
  const gap = w / n
  const start = Math.floor(rand() * BUNTING_COLORS.length)
  return {
    y: h * 0.03 + i * Math.min(h * 0.17, 74),
    sag: Math.min(h * 0.09, 44) * between(rand, 0.7, 1.05),
    flags: Array.from({ length: n }, (_, k) => ({
      at: (k + 0.5) / n,
      color: (start + k) % BUNTING_COLORS.length,
      phase: rand() * TAU
    })),
    flagW: Math.min(gap * 0.82, 22),
    flagH: Math.min(gap * 1.05, 28),
    phase: rand() * TAU
  }
}

/** A altura do fio em t (0–1): parábola, mexendo um pouco com o vento. */
export function cordY(c: Cord, t: number, time: number): number {
  const belly = 4 * t * (1 - t)
  return c.y + belly * (c.sag + Math.sin(time * 0.9 + c.phase) * 2.5)
}

function drawCord(ctx: Ctx, c: Cord, s: BuntingState): void {
  ctx.strokeStyle = 'rgba(245,245,244,0.7)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, cordY(c, 0, s.t))
  for (let k = 1; k <= 20; k++) ctx.lineTo((s.w * k) / 20, cordY(c, k / 20, s.t))
  ctx.stroke()
}

function drawFlag(ctx: Ctx, f: Flag, c: Cord, s: BuntingState): void {
  const x = f.at * s.w
  const y = cordY(c, f.at, s.t)
  const swing = Math.sin(s.t * 1.6 + f.phase) * c.flagW * 0.34
  ctx.fillStyle = BUNTING_COLORS[f.color]
  ctx.beginPath()
  ctx.moveTo(x - c.flagW / 2, y)
  ctx.lineTo(x + c.flagW / 2, y)
  ctx.lineTo(x + swing, y + c.flagH)
  ctx.closePath()
  ctx.fill()
}

export const buntingScene: Scene<BuntingState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): BuntingState {
    const n = countFor(3, p.density, 5)
    return { w, h, t: 0, cords: Array.from({ length: n }, (_, i) => newCord(i, w, h, rand)) }
  },
  step(s: BuntingState, dt: number): void {
    s.t = (s.t + dt) % 1000
  },
  draw(ctx: Ctx, s: BuntingState): void {
    ctx.globalAlpha = 0.95
    for (const c of s.cords) {
      for (const f of c.flags) drawFlag(ctx, f, c, s)
      drawCord(ctx, c, s)
    }
  }
}
