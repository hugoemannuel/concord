// Bolhas: sobem balançando, com a borda fina, o miolo quase transparente e um
// reflexo no canto. As maiores sobem mais rápido, como na água.
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, countForArea, hexRgb, mix, rgba, TAU, WHITE } from './util'

export interface Bubble {
  x: number
  y: number
  r: number
  v: number
  phase: number
  freq: number
  amp: number
}

export interface BubblesState {
  w: number
  h: number
  bubbles: Bubble[]
  rim: string
  body: string
  shine: string
}

function spawn(b: Bubble, s: { w: number; h: number }, rand: Rand, bottom: boolean): void {
  b.r = 2.5 + rand() * rand() * 13
  b.x = rand() * s.w
  b.y = bottom ? s.h + b.r + rand() * 40 : rand() * s.h
  b.v = 18 + b.r * between(rand, 2.4, 4.2)
  b.phase = rand() * TAU
  b.freq = between(rand, 0.8, 2)
  b.amp = between(rand, 6, 20)
}

function newBubble(s: { w: number; h: number }, rand: Rand): Bubble {
  const b: Bubble = { x: 0, y: 0, r: 0, v: 0, phase: 0, freq: 0, amp: 0 }
  spawn(b, s, rand, false)
  return b
}

function drawBubble(ctx: Ctx, b: Bubble, s: BubblesState): void {
  ctx.fillStyle = s.body
  ctx.beginPath()
  ctx.arc(b.x, b.y, b.r, 0, TAU)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = s.shine
  ctx.beginPath()
  ctx.arc(b.x - b.r * 0.38, b.y - b.r * 0.42, Math.max(0.6, b.r * 0.2), 0, TAU)
  ctx.fill()
}

export const bubblesScene: Scene<BubblesState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): BubblesState {
    const color = hexRgb(p.color)
    return {
      w,
      h,
      bubbles: Array.from({ length: countForArea(24, p.density, 64, w, h) }, () =>
        newBubble({ w, h }, rand)
      ),
      rim: rgba(mix(color, WHITE, 0.25), 0.7),
      body: rgba(color, 0.1),
      shine: rgba(WHITE, 0.75)
    }
  },
  step(s: BubblesState, dt: number, rand: Rand): void {
    for (const b of s.bubbles) {
      b.y -= b.v * dt
      b.phase = (b.phase + b.freq * dt) % TAU
      b.x += Math.cos(b.phase) * b.amp * dt
      if (b.y < -b.r * 2) spawn(b, s, rand, true)
    }
  },
  draw(ctx: Ctx, s: BubblesState): void {
    ctx.strokeStyle = s.rim
    ctx.lineWidth = 1
    for (const b of s.bubbles) drawBubble(ctx, b, s)
  }
}
