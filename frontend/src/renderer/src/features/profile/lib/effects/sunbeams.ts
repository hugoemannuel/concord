// Raios de luz: feixes que descem do alto em leque, respirando devagar, e uma
// poeirinha que brilha ao atravessá-los. Cada feixe são camadas de larguras
// diferentes, que somadas apagam a borda dura do triângulo.
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, countFor, hexRgb, mix, rgba, TAU, WHITE } from './util'

/** As larguras das camadas de um feixe, em fração da abertura dele. */
const LAYERS = [1, 0.66, 0.33]
/** Feixe é área grande pintada três vezes: o teto segura o custo em tela cheia. */
const MAX_BEAMS = 8

export interface Beam {
  angle: number
  spread: number
  sway: number
  phase: number
  v: number
  alpha: number
}

export interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
}

export interface SunbeamsState {
  w: number
  h: number
  ox: number
  oy: number
  len: number
  beams: Beam[]
  motes: Mote[]
  glow: (alpha: number) => string
  mote: string
}

function newBeam(i: number, n: number, rand: Rand): Beam {
  const slot = n === 1 ? 0.5 : i / (n - 1)
  return {
    angle: 0.42 + slot * 1.2 + between(rand, -0.05, 0.05),
    spread: between(rand, 0.07, 0.17),
    sway: between(rand, 0.02, 0.06),
    phase: rand() * TAU,
    v: between(rand, 0.2, 0.55),
    alpha: between(rand, 0.3, 0.55)
  }
}

function drawBeam(ctx: Ctx, b: Beam, s: SunbeamsState): void {
  const a = b.angle + Math.sin(b.phase) * b.sway
  const breath = 0.6 + 0.4 * Math.sin(b.phase * 1.7)
  const fill = ctx.createLinearGradient(
    s.ox,
    s.oy,
    s.ox + Math.cos(a) * s.len,
    s.oy + Math.sin(a) * s.len
  )
  fill.addColorStop(0, s.glow((b.alpha * breath) / LAYERS.length))
  fill.addColorStop(1, s.glow(0))
  ctx.fillStyle = fill
  for (const k of LAYERS) {
    const spread = b.spread * k
    ctx.beginPath()
    ctx.moveTo(s.ox, s.oy)
    ctx.lineTo(s.ox + Math.cos(a - spread) * s.len, s.oy + Math.sin(a - spread) * s.len)
    ctx.lineTo(s.ox + Math.cos(a + spread) * s.len, s.oy + Math.sin(a + spread) * s.len)
    ctx.closePath()
    ctx.fill()
  }
}

function stepMote(m: Mote, s: SunbeamsState, dt: number): void {
  m.x += m.vx * dt
  m.y += m.vy * dt
  m.phase = (m.phase + dt) % TAU
  if (m.x > s.w) m.x = 0
  if (m.y > s.h) m.y = 0
}

export const sunbeamsScene: Scene<SunbeamsState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): SunbeamsState {
    const color = hexRgb(p.color)
    const n = countFor(6, p.density, MAX_BEAMS)
    return {
      w,
      h,
      ox: w * 0.12,
      oy: -h * 0.08,
      len: Math.hypot(w, h) * 1.15,
      beams: Array.from({ length: n }, (_, i) => newBeam(i, n, rand)),
      motes: Array.from({ length: countFor(16, p.density, 40) }, () => ({
        x: rand() * w,
        y: rand() * h,
        vx: between(rand, 2, 12),
        vy: between(rand, 3, 14),
        r: between(rand, 0.6, 1.5),
        phase: rand() * TAU
      })),
      glow: (alpha) => rgba(color, Math.round(alpha * 1000) / 1000),
      mote: rgba(mix(color, WHITE, 0.6), 1)
    }
  },
  step(s: SunbeamsState, dt: number): void {
    for (const b of s.beams) b.phase = (b.phase + b.v * dt) % TAU
    for (const m of s.motes) stepMote(m, s, dt)
  },
  draw(ctx: Ctx, s: SunbeamsState): void {
    ctx.globalCompositeOperation = 'lighter'
    for (const b of s.beams) drawBeam(ctx, b, s)
    ctx.fillStyle = s.mote
    for (const m of s.motes) {
      ctx.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(m.phase))
      ctx.beginPath()
      ctx.arc(m.x, m.y, m.r, 0, TAU)
      ctx.fill()
    }
  }
}
