// Ondas: camadas de mar na parte de baixo, cada uma com a sua soma de senos, e a
// espuma na crista das da frente. A quantidade muda quantas camadas há, com teto
// baixo: cada camada pinta quase meia tela.
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, clamp, countFor, hexRgb, mix, rgba, TAU, WHITE, type RGB } from './util'

/** Espaço entre os pontos de uma onda, em px: tela larga não custa mais pontos. */
const MIN_STEP = 10
const MAX_POINTS = 60
const MAX_WAVES = 4

export interface Wave {
  /** Altura de repouso, em fração do cartão a partir do alto. */
  base: number
  amp: number
  k1: number
  k2: number
  v1: number
  v2: number
  p1: number
  p2: number
}

export interface OceanState {
  w: number
  h: number
  step: number
  waves: Wave[]
  top: RGB
  deep: RGB
  foam: string
}

export function waveY(g: Wave, h: number, x: number): number {
  return (
    g.base * h +
    Math.sin(x * g.k1 + g.p1) * g.amp +
    Math.sin(x * g.k2 + g.p2) * g.amp * 0.45
  )
}

function newWave(i: number, n: number, rand: Rand): Wave {
  const depth = n === 1 ? 1 : i / (n - 1)
  return {
    base: 0.62 + depth * 0.26,
    amp: between(rand, 7, 12) + depth * 5,
    k1: between(rand, 0.012, 0.022),
    k2: between(rand, 0.03, 0.05),
    v1: between(rand, 0.5, 0.95) * (i % 2 ? -1 : 1),
    v2: between(rand, 0.8, 1.4) * (i % 2 ? 1 : -1),
    p1: rand() * TAU,
    p2: rand() * TAU
  }
}

function tracePoints(ctx: Ctx, s: OceanState, g: Wave): void {
  ctx.moveTo(0, waveY(g, s.h, 0))
  for (let x = s.step; x < s.w + s.step; x += s.step) ctx.lineTo(x, waveY(g, s.h, x))
}

function drawWave(ctx: Ctx, s: OceanState, g: Wave, i: number): void {
  const depth = s.waves.length === 1 ? 1 : i / (s.waves.length - 1)
  const color = mix(s.top, s.deep, depth)
  const top = (g.base * s.h) - g.amp * 1.45
  const fill = ctx.createLinearGradient(0, top, 0, s.h)
  fill.addColorStop(0, rgba(color, 0.42 + depth * 0.28))
  fill.addColorStop(1, rgba(s.deep, 0.75))
  ctx.fillStyle = fill
  ctx.beginPath()
  tracePoints(ctx, s, g)
  ctx.lineTo(s.w + s.step, s.h)
  ctx.lineTo(0, s.h)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  tracePoints(ctx, s, g)
  ctx.stroke()
}

export const oceanScene: Scene<OceanState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): OceanState {
    const color = hexRgb(p.color)
    const n = clamp(countFor(3, p.density, MAX_WAVES), 2, MAX_WAVES)
    return {
      w,
      h,
      step: Math.max(MIN_STEP, w / MAX_POINTS),
      waves: Array.from({ length: n }, (_, i) => newWave(i, n, rand)),
      top: mix(color, WHITE, 0.2),
      deep: mix(color, [3, 16, 40], 0.65),
      foam: rgba(mix(color, WHITE, 0.8), 0.55)
    }
  },
  step(s: OceanState, dt: number): void {
    for (const g of s.waves) {
      g.p1 = (g.p1 + g.v1 * dt) % TAU
      g.p2 = (g.p2 + g.v2 * dt) % TAU
    }
  },
  draw(ctx: Ctx, s: OceanState): void {
    ctx.strokeStyle = s.foam
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    s.waves.forEach((g, i) => drawWave(ctx, s, g, i))
  }
}
