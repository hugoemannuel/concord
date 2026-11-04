import type { SceneInput } from './milestoneScenes'
import { clamp01 } from './sceneKit'

/**
 * Confete das cenas especiais de nível: metade estoura do número (no
 * instante `burstAt`), metade chove de cima. Montado uma vez, desenhado sem
 * alocar nada por quadro.
 */

/** Gravidade do confete, em px/ms². */
const GRAVITY = 0.00045

export interface Confetto {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  w: number
  h: number
  color: string
  /** Quando aparece (ms). */
  at: number
}

export function makeConfetti(
  s: SceneInput,
  r: () => number,
  count: number,
  burstAt: number
): Confetto[] {
  return Array.from({ length: count }, (_, i) => {
    const burst = i % 2 === 0
    const angle = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.6
    const speed = (0.35 + r() * 0.55) * (1 + s.power * 0.5)
    return {
      x: burst ? s.cx : r() * s.w,
      y: burst ? s.cy : -20 - r() * 60,
      vx: burst ? Math.cos(angle) * speed : (r() - 0.5) * 0.08,
      vy: burst ? Math.sin(angle) * speed : 0.08 + r() * 0.12,
      rot: r() * Math.PI,
      spin: (r() - 0.5) * 0.02,
      w: 5 + r() * 6,
      h: 3 + r() * 4,
      color: s.colors[i % s.colors.length],
      at: burst ? burstAt : 200 + r() * 1600
    }
  })
}

export function drawConfetto(
  ctx: CanvasRenderingContext2D,
  c: Confetto,
  t: number,
  fade: number
): void {
  const dt = t - c.at
  if (dt < 0) return
  ctx.save()
  ctx.translate(c.x + c.vx * dt, c.y + c.vy * dt + 0.5 * GRAVITY * dt * dt)
  ctx.rotate(c.rot + c.spin * dt)
  ctx.globalAlpha = fade * clamp01(dt / 120)
  ctx.fillStyle = c.color
  ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h * Math.abs(Math.cos(c.rot + dt * 0.012)) + 1)
  ctx.restore()
}
