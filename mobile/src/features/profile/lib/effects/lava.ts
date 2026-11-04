// Lava: um lago incandescente na base, com a superfície mexendo, e bolhas de
// magma que sobem esticadas, esfriam e voltam a afundar, como numa lâmpada de lava.
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, countFor, hexRgb, mix, rgba, TAU, type RGB } from './util'

const STEP = 12
const MAX_POINTS = 50
const HOT: RGB = [255, 214, 90]
const COOL: RGB = [70, 8, 4]

export interface Blob {
  x: number
  /** Altura de 0 (na base) a 1 (no ponto mais alto da viagem). */
  lift: number
  v: number
  r: number
  peak: number
  phase: number
}

export interface LavaState {
  w: number
  h: number
  t: number
  step: number
  surface: number
  blobs: Blob[]
  base: RGB
}

function launch(b: Blob, w: number, rand: Rand): void {
  b.x = rand() * w
  b.r = between(rand, 10, 26)
  b.v = between(rand, 0.09, 0.2)
  b.peak = between(rand, 0.35, 0.82)
  b.phase = rand() * TAU
}

function newBlob(w: number, rand: Rand): Blob {
  const b: Blob = { x: 0, lift: rand() * Math.PI, v: 0, r: 0, peak: 0, phase: 0 }
  launch(b, w, rand)
  return b
}

function surfaceY(s: LavaState, x: number): number {
  return (
    s.surface +
    Math.sin(x * 0.018 + s.t * 0.8) * 7 +
    Math.sin(x * 0.043 - s.t * 1.1) * 3.5
  )
}

function drawLake(ctx: Ctx, s: LavaState): void {
  const fill = ctx.createLinearGradient(0, s.surface - 10, 0, s.h)
  fill.addColorStop(0, rgba(mix(s.base, HOT, 0.7), 0.95))
  fill.addColorStop(0.35, rgba(s.base, 0.92))
  fill.addColorStop(1, rgba(mix(s.base, COOL, 0.8), 0.85))
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(0, surfaceY(s, 0))
  for (let x = s.step; x < s.w + s.step; x += s.step) ctx.lineTo(x, surfaceY(s, x))
  ctx.lineTo(s.w + s.step, s.h)
  ctx.lineTo(0, s.h)
  ctx.closePath()
  ctx.fill()
}

function drawBlob(ctx: Ctx, b: Blob, s: LavaState): void {
  const rise = Math.sin(b.lift)
  const y = s.surface + b.r * 0.4 - rise * b.peak * s.surface
  // Sobe quente e esticada; lá em cima esfria e arredonda.
  const heat = 1 - rise * 0.6
  const stretch = 1 + Math.abs(Math.cos(b.lift)) * 0.35
  const fill = ctx.createRadialGradient(b.x, y - b.r * 0.2, 0, b.x, y, b.r * 1.25)
  fill.addColorStop(0, rgba(mix(s.base, HOT, heat), 1))
  fill.addColorStop(0.7, rgba(mix(s.base, COOL, 0.2 + (1 - heat) * 0.5), 0.95))
  fill.addColorStop(1, rgba(COOL, 0))
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.ellipse(b.x, y, b.r * (1 / Math.sqrt(stretch)), b.r * stretch, 0, 0, TAU)
  ctx.fill()
}

export const lavaScene: Scene<LavaState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): LavaState {
    return {
      w,
      h,
      t: 0,
      step: Math.max(STEP, w / MAX_POINTS),
      surface: h * 0.8,
      blobs: Array.from({ length: countFor(7, p.density, 16) }, () => newBlob(w, rand)),
      base: hexRgb(p.color)
    }
  },
  step(s: LavaState, dt: number, rand: Rand): void {
    s.t = (s.t + dt) % 1000
    for (const b of s.blobs) {
      b.lift += b.v * dt * Math.PI
      if (b.lift >= Math.PI) {
        b.lift -= Math.PI
        launch(b, s.w, rand)
      }
    }
  },
  draw(ctx: Ctx, s: LavaState): void {
    for (const b of s.blobs) drawBlob(ctx, b, s)
    drawLake(ctx, s)
  }
}
