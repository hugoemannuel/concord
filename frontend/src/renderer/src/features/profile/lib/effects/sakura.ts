// Pétalas de sakura: caem devagar balançando e virando ao vento, em três tons
// da cor escolhida (as mais claras parecem mais perto).
import { breeze, newFaller, placeFaller, stepFaller, type Faller, type FallerSpec } from './falling'
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { countForArea, hexRgb, mix, rgba, WHITE } from './util'

const SPEC: FallerSpec = { vy: [20, 46], amp: [14, 34], size: [4, 8.5], kinds: 3 }

export interface SakuraState {
  w: number
  h: number
  t: number
  petals: Faller[]
  shades: string[]
}

/** Pétala: gota com um chanfro na ponta. */
function petalPath(ctx: Ctx, s: number): void {
  ctx.beginPath()
  ctx.moveTo(0, s)
  ctx.bezierCurveTo(s * 0.95, s * 0.5, s * 0.8, -s * 0.8, s * 0.16, -s)
  ctx.lineTo(0, -s * 0.72)
  ctx.lineTo(-s * 0.16, -s)
  ctx.bezierCurveTo(-s * 0.8, -s * 0.8, -s * 0.95, s * 0.5, 0, s)
  ctx.closePath()
}

export const sakuraScene: Scene<SakuraState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): SakuraState {
    const color = hexRgb(p.color)
    const petals = Array.from({ length: countForArea(34, p.density, 90, w, h) }, () =>
      newFaller({ w, h }, SPEC, rand)
    )
    const shades = [0, 0.3, 0.6].map((k) => rgba(mix(color, WHITE, k), 1))
    return { w, h, t: 0, petals, shades }
  },
  step(s: SakuraState, dt: number, rand: Rand): void {
    s.t = (s.t + dt) % 1000
    const wind = breeze(s.t, 22) + 10
    for (const f of s.petals) stepFaller(f, s, SPEC, dt, wind, rand)
  },
  draw(ctx: Ctx, s: SakuraState): void {
    ctx.globalAlpha = 0.85
    for (const f of s.petals) {
      ctx.fillStyle = s.shades[f.kind]
      ctx.save()
      placeFaller(ctx, f)
      petalPath(ctx, f.size)
      ctx.fill()
      ctx.restore()
    }
  }
}
