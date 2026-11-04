// Folhas de outono: maiores e mais pesadas que as pétalas, com a nervura
// desenhada e tons que vão do vermelho ao amarelo a partir da cor escolhida.
import { breeze, newFaller, placeFaller, stepFaller, type Faller, type FallerSpec } from './falling'
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { countForArea, hexRgb, mix, rgba, type RGB } from './util'

const SPEC: FallerSpec = { vy: [28, 62], amp: [18, 48], size: [7, 13], kinds: 4 }
const RED: RGB = [185, 28, 28]
const YELLOW: RGB = [250, 204, 21]
const BROWN: RGB = [92, 45, 14]

export interface LeavesState {
  w: number
  h: number
  t: number
  leaves: Faller[]
  shades: string[]
  vein: string
}

function leafPath(ctx: Ctx, s: number): void {
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.bezierCurveTo(s * 0.5, -s * 0.72, s * 0.86, -s * 0.08, s * 0.5, s * 0.34)
  ctx.bezierCurveTo(s * 0.34, s * 0.56, s * 0.12, s * 0.7, 0, s * 0.78)
  ctx.bezierCurveTo(-s * 0.12, s * 0.7, -s * 0.34, s * 0.56, -s * 0.5, s * 0.34)
  ctx.bezierCurveTo(-s * 0.86, -s * 0.08, -s * 0.5, -s * 0.72, 0, -s)
  ctx.closePath()
}

function veinPath(ctx: Ctx, s: number): void {
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.86)
  ctx.lineTo(0, s * 1.16)
  for (const k of [-0.32, 0.08]) {
    ctx.moveTo(0, s * (k + 0.24))
    ctx.lineTo(s * 0.42, s * k)
    ctx.moveTo(0, s * (k + 0.24))
    ctx.lineTo(-s * 0.42, s * k)
  }
}

export const leavesScene: Scene<LeavesState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): LeavesState {
    const color = hexRgb(p.color)
    const leaves = Array.from({ length: countForArea(26, p.density, 64, w, h) }, () =>
      newFaller({ w, h }, SPEC, rand)
    )
    const shades = [
      color,
      mix(color, RED, 0.55),
      mix(color, YELLOW, 0.55),
      mix(color, BROWN, 0.35)
    ].map((c) => rgba(c, 1))
    return { w, h, t: 0, leaves, shades, vein: rgba(mix(color, BROWN, 0.75), 0.75) }
  },
  step(s: LeavesState, dt: number, rand: Rand): void {
    s.t = (s.t + dt) % 1000
    const wind = breeze(s.t, 34)
    for (const f of s.leaves) stepFaller(f, s, SPEC, dt, wind, rand)
  },
  draw(ctx: Ctx, s: LeavesState): void {
    ctx.globalAlpha = 0.9
    ctx.lineWidth = 0.8
    ctx.strokeStyle = s.vein
    for (const f of s.leaves) {
      ctx.fillStyle = s.shades[f.kind]
      ctx.save()
      placeFaller(ctx, f)
      leafPath(ctx, f.size)
      ctx.fill()
      veinPath(ctx, f.size)
      ctx.stroke()
      ctx.restore()
    }
  }
}
