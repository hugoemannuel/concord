// Névoa: manchas grandes e bem suaves que atravessam o cartão devagar, em dois
// planos. São poucas de propósito: o gradiente é a parte cara, e o raio tem teto.
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, clamp, countFor, hexRgb, rgba, TAU } from './util'

const MAX_RADIUS = 340

export interface FogPuff {
  x: number
  y: number
  r: number
  v: number
  squash: number
  alpha: number
  phase: number
  breath: number
}

export interface FogState {
  w: number
  h: number
  puffs: FogPuff[]
  dense: (alpha: number) => string
}

function newPuff(w: number, h: number, rand: Rand): FogPuff {
  const r = clamp(Math.max(w, h) * between(rand, 0.28, 0.5), 40, MAX_RADIUS)
  return {
    x: between(rand, -r, w + r),
    y: between(rand, h * 0.1, h),
    r,
    v: between(rand, 6, 20),
    squash: between(rand, 0.4, 0.68),
    alpha: between(rand, 0.14, 0.26),
    phase: rand() * TAU,
    breath: between(rand, 0.25, 0.6)
  }
}

function drawPuff(ctx: Ctx, f: FogPuff, s: FogState): void {
  const a = f.alpha * (0.72 + 0.28 * Math.sin(f.phase))
  const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, f.r)
  fill.addColorStop(0, s.dense(a))
  fill.addColorStop(0.55, s.dense(a * 0.55))
  fill.addColorStop(1, s.dense(0))
  ctx.save()
  ctx.translate(f.x, f.y)
  ctx.scale(1, f.squash)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(0, 0, f.r, 0, TAU)
  ctx.fill()
  ctx.restore()
}

export const fogScene: Scene<FogState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): FogState {
    const color = hexRgb(p.color)
    return {
      w,
      h,
      puffs: Array.from({ length: countFor(7, p.density, 14) }, () => newPuff(w, h, rand)),
      dense: (alpha) => rgba(color, Math.round(alpha * 1000) / 1000)
    }
  },
  step(s: FogState, dt: number): void {
    for (const f of s.puffs) {
      f.x += f.v * dt
      f.phase = (f.phase + f.breath * dt) % TAU
      if (f.x - f.r > s.w) f.x = -f.r
    }
  },
  draw(ctx: Ctx, s: FogState): void {
    for (const f of s.puffs) drawPuff(ctx, f, s)
  }
}
