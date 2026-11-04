// Estrelas cadentes: um céu de estrelinhas piscando e riscos rápidos que
// atravessam o cartão de vez em quando, com rastro que some aos poucos.
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, countFor, countForArea, hexRgb, mix, rgba, TAU, WHITE } from './util'

/** Inclinação do risco (para baixo e para a esquerda). */
const DIR_X = -0.86
const DIR_Y = 0.5

export interface SkyStar {
  x: number
  y: number
  r: number
  phase: number
  v: number
}

export interface Meteor {
  x: number
  y: number
  v: number
  len: number
  /** Segundos até aparecer; ≤ 0 = voando. */
  wait: number
  life: number
  max: number
}

export interface MeteorsState {
  w: number
  h: number
  stars: SkyStar[]
  meteors: Meteor[]
  star: string
  head: string
  tail: string
  fade: string
}

function launch(m: Meteor, s: { w: number; h: number }, rand: Rand, wait: [number, number]): void {
  m.x = between(rand, s.w * 0.25, s.w * 1.2)
  m.y = between(rand, -s.h * 0.1, s.h * 0.55)
  m.v = between(rand, 340, 620)
  m.len = between(rand, 60, 150)
  m.wait = between(rand, wait[0], wait[1])
  m.max = between(rand, 0.45, 0.95)
  m.life = 0
}

function newMeteor(s: { w: number; h: number }, rand: Rand): Meteor {
  const m: Meteor = { x: 0, y: 0, v: 0, len: 0, wait: 0, life: 0, max: 1 }
  launch(m, s, rand, [0, 4])
  return m
}

function stepMeteor(m: Meteor, s: MeteorsState, dt: number, rand: Rand): void {
  if (m.wait > 0) {
    m.wait -= dt
    return
  }
  m.x += DIR_X * m.v * dt
  m.y += DIR_Y * m.v * dt
  m.life += dt
  if (m.life >= m.max) launch(m, s, rand, [0.8, 5])
}

function drawMeteor(ctx: Ctx, m: Meteor, s: MeteorsState): void {
  if (m.wait > 0) return
  const k = m.life / m.max
  ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, k)) * 0.95
  const tx = m.x - DIR_X * m.len
  const ty = m.y - DIR_Y * m.len
  const trail = ctx.createLinearGradient(m.x, m.y, tx, ty)
  trail.addColorStop(0, s.tail)
  trail.addColorStop(1, s.fade)
  ctx.strokeStyle = trail
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(m.x, m.y)
  ctx.lineTo(tx, ty)
  ctx.stroke()
  ctx.fillStyle = s.head
  ctx.beginPath()
  ctx.arc(m.x, m.y, 1.8, 0, TAU)
  ctx.fill()
}

export const meteorsScene: Scene<MeteorsState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): MeteorsState {
    const color = hexRgb(p.color)
    return {
      w,
      h,
      stars: Array.from({ length: countForArea(46, p.density, 110, w, h) }, () => ({
        x: rand() * w,
        y: rand() * h,
        r: between(rand, 0.5, 1.4),
        phase: rand() * TAU,
        v: between(rand, 0.5, 2)
      })),
      meteors: Array.from({ length: countFor(4, p.density, 10) }, () =>
        newMeteor({ w, h }, rand)
      ),
      star: rgba(mix(color, WHITE, 0.4), 1),
      head: rgba(WHITE, 1),
      tail: rgba(mix(color, WHITE, 0.3), 0.95),
      fade: rgba(color, 0)
    }
  },
  step(s: MeteorsState, dt: number, rand: Rand): void {
    for (const st of s.stars) st.phase = (st.phase + st.v * dt) % TAU
    for (const m of s.meteors) stepMeteor(m, s, dt, rand)
  },
  draw(ctx: Ctx, s: MeteorsState): void {
    ctx.fillStyle = s.star
    for (const st of s.stars) {
      ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(st.phase))
      ctx.beginPath()
      ctx.arc(st.x, st.y, st.r, 0, TAU)
      ctx.fill()
    }
    ctx.lineCap = 'round'
    for (const m of s.meteors) drawMeteor(ctx, m, s)
  }
}
