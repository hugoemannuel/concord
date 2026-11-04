// Vaga-lumes: pontinhos que passeiam sem rumo e piscam devagar, cada um no seu
// tempo, com um halo suave em volta (só os acesos pagam o gradiente).
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, countForArea, hexRgb, mix, rgba, TAU, WHITE } from './util'

/** Raio do halo, em vezes o raio do vaga-lume. */
const HALO = 8

export interface Firefly {
  x: number
  y: number
  angle: number
  v: number
  r: number
  phase: number
  blink: number
}

export interface FirefliesState {
  w: number
  h: number
  flies: Firefly[]
  halo: string
  mid: string
  clear: string
  core: string
}

function newFly(w: number, h: number, rand: Rand): Firefly {
  return {
    x: rand() * w,
    y: rand() * h,
    angle: rand() * TAU,
    v: between(rand, 8, 26),
    r: between(rand, 1.2, 2.6),
    phase: rand() * TAU,
    blink: between(rand, 0.7, 1.9)
  }
}

function wrap(v: number, max: number): number {
  if (v < 0) return v + max
  return v > max ? v - max : v
}

function stepFly(f: Firefly, s: FirefliesState, dt: number, rand: Rand): void {
  f.angle = (f.angle + between(rand, -2.6, 2.6) * dt) % TAU
  f.x = wrap(f.x + Math.cos(f.angle) * f.v * dt, s.w)
  f.y = wrap(f.y + Math.sin(f.angle) * f.v * dt, s.h)
  f.phase = (f.phase + f.blink * dt) % TAU
}

function drawFly(ctx: Ctx, f: Firefly, s: FirefliesState): void {
  const on = Math.max(0, Math.sin(f.phase))
  const light = on * on
  if (light < 0.03) return
  const reach = f.r * HALO
  const halo = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, reach)
  halo.addColorStop(0, s.halo)
  halo.addColorStop(0.35, s.mid)
  halo.addColorStop(1, s.clear)
  ctx.globalAlpha = light
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(f.x, f.y, reach, 0, TAU)
  ctx.fill()
  ctx.fillStyle = s.core
  ctx.beginPath()
  ctx.arc(f.x, f.y, f.r, 0, TAU)
  ctx.fill()
}

export const firefliesScene: Scene<FirefliesState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): FirefliesState {
    const color = hexRgb(p.color)
    const flies = Array.from({ length: countForArea(24, p.density, 64, w, h) }, () => newFly(w, h, rand))
    return {
      w,
      h,
      flies,
      halo: rgba(color, 0.55),
      mid: rgba(color, 0.14),
      clear: rgba(color, 0),
      core: rgba(mix(color, WHITE, 0.65), 1)
    }
  },
  step(s: FirefliesState, dt: number, rand: Rand): void {
    for (const f of s.flies) stepFly(f, s, dt, rand)
  },
  draw(ctx: Ctx, s: FirefliesState): void {
    ctx.globalCompositeOperation = 'lighter'
    for (const f of s.flies) drawFly(ctx, f, s)
  }
}
