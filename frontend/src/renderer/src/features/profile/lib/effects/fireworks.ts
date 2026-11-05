// Fogos de artifício: foguetes sobem e estouram num anel de faíscas que cai com
// a gravidade. As faíscas vêm de um anel de tamanho fixo (nada é alocado depois
// do init), então o custo não cresce por mais que estoure. Paleta própria.
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, clamp, countFor, TAU } from './util'

export const FIREWORK_COLORS = ['#ff5e7e', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f1c']
const GRAVITY = 70
const DRAG = 0.985
/** Comprimento do risco da faísca, em segundos de velocidade. */
const TRAIL = 0.09

export interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: number
}

export interface Rocket {
  x: number
  y: number
  v: number
  /** Altura em que estoura. */
  burst: number
  wait: number
  color: number
}

export interface FireworksState {
  w: number
  h: number
  rockets: Rocket[]
  sparks: Spark[]
  /** Quanto o estouro abre: em tela grande, proporcional a ela. */
  reach: number
  /** Próxima faísca do anel a reaproveitar. */
  next: number
}

function launch(r: Rocket, s: { w: number; h: number }, rand: Rand, wait: number): void {
  r.x = between(rand, s.w * 0.12, s.w * 0.88)
  r.y = s.h + 6
  r.v = between(rand, s.h * 0.6, s.h * 0.95) + 60
  r.burst = between(rand, s.h * 0.12, s.h * 0.5)
  r.wait = wait
  r.color = Math.floor(rand() * FIREWORK_COLORS.length)
}

function newRocket(s: { w: number; h: number }, rand: Rand): Rocket {
  const r: Rocket = { x: 0, y: 0, v: 0, burst: 0, wait: 0, color: 0 }
  launch(r, s, rand, rand() * 1.2)
  return r
}

function explode(s: FireworksState, r: Rocket, rand: Rand): void {
  const n = Math.min(s.sparks.length, Math.round(between(rand, 26, 44)))
  const speed = between(rand, 80, 150) * s.reach
  for (let i = 0; i < n; i++) {
    const sp = s.sparks[s.next]
    s.next = (s.next + 1) % s.sparks.length
    const a = (TAU * i) / n + rand() * 0.1
    const v = speed * between(rand, 0.72, 1)
    sp.x = r.x
    sp.y = r.y
    sp.vx = Math.cos(a) * v
    sp.vy = Math.sin(a) * v
    sp.life = 0
    sp.max = between(rand, 0.9, 1.6)
    sp.color = rand() < 0.8 ? r.color : Math.floor(rand() * FIREWORK_COLORS.length)
  }
}

function stepRocket(r: Rocket, s: FireworksState, dt: number, rand: Rand): void {
  if (r.wait > 0) {
    r.wait -= dt
    return
  }
  r.y -= r.v * dt
  if (r.y > r.burst) return
  explode(s, r, rand)
  launch(r, s, rand, between(rand, 0.2, 1.5))
}

function stepSpark(sp: Spark, dt: number): void {
  if (sp.life >= sp.max) return
  sp.life = Math.min(sp.max, sp.life + dt)
  sp.x += sp.vx * dt
  sp.y += sp.vy * dt
  sp.vy += GRAVITY * dt
  const drag = DRAG ** (dt * 30)
  sp.vx *= drag
  sp.vy *= drag
}

function drawSpark(ctx: Ctx, sp: Spark): void {
  if (sp.life >= sp.max) return
  const k = 1 - sp.life / sp.max
  ctx.globalAlpha = Math.min(1, k * 1.5)
  ctx.strokeStyle = FIREWORK_COLORS[sp.color]
  ctx.beginPath()
  ctx.moveTo(sp.x, sp.y)
  ctx.lineTo(sp.x - sp.vx * TRAIL, sp.y - sp.vy * TRAIL)
  ctx.stroke()
}

function drawRocket(ctx: Ctx, r: Rocket): void {
  if (r.wait > 0) return
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = FIREWORK_COLORS[r.color]
  ctx.beginPath()
  ctx.moveTo(r.x, r.y)
  ctx.lineTo(r.x, r.y + 14)
  ctx.stroke()
}

export const fireworksScene: Scene<FireworksState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): FireworksState {
    return {
      w,
      h,
      rockets: Array.from({ length: countFor(3, p.density, 6) }, () => newRocket({ w, h }, rand)),
      sparks: Array.from({ length: countFor(110, p.density, 150) }, () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 1,
        max: 1,
        color: 0
      })),
      reach: clamp(Math.hypot(w, h) / 540, 1, 2.4),
      next: 0
    }
  },
  step(s: FireworksState, dt: number, rand: Rand): void {
    for (const sp of s.sparks) stepSpark(sp, dt)
    for (const r of s.rockets) stepRocket(r, s, dt, rand)
  },
  draw(ctx: Ctx, s: FireworksState): void {
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineWidth = 2
    for (const sp of s.sparks) drawSpark(ctx, sp)
    for (const r of s.rockets) drawRocket(ctx, r)
  }
}
