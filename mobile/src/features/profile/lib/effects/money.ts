// Dinheiro caindo: notas com o cifrão e algumas moedas douradas, virando no ar.
import { newFaller, placeFaller, stepFaller, type Faller, type FallerSpec } from './falling'
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { countForArea, hexRgb, mix, rgba, TAU, WHITE, type RGB } from './util'

/** kind 0–2: nota; 3: moeda. */
const COIN = 3
const SPEC: FallerSpec = { vy: [46, 96], amp: [8, 30], size: [9, 13], kinds: 4 }
const GOLD: RGB = [250, 204, 21]
const DARK: RGB = [6, 40, 22]
const FONT_PX = 11

export interface MoneyState {
  w: number
  h: number
  bills: Faller[]
  paper: string
  edge: string
  ink: string
  gold: string
  goldEdge: string
}

function drawBill(ctx: Ctx, s: MoneyState, size: number): void {
  const w = size * 2.2
  const h = size * 1.1
  ctx.fillStyle = s.paper
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.fillStyle = s.edge
  ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, 1)
  ctx.fillRect(-w / 2 + 1, h / 2 - 2, w - 2, 1)
  ctx.fillStyle = s.ink
  // Uma fonte só, ampliada: trocar ctx.font por nota custa caro a cada quadro.
  ctx.scale(size / FONT_PX, size / FONT_PX)
  ctx.fillText('$', 0, 0.5)
}

function drawCoin(ctx: Ctx, s: MoneyState, size: number): void {
  const r = size * 0.55
  ctx.fillStyle = s.gold
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = s.goldEdge
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.7, 0, TAU)
  ctx.stroke()
}

export const moneyScene: Scene<MoneyState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): MoneyState {
    const color = hexRgb(p.color)
    const bills = Array.from({ length: countForArea(20, p.density, 50, w, h) }, () =>
      newFaller({ w, h }, SPEC, rand)
    )
    return {
      w,
      h,
      bills,
      paper: rgba(color, 1),
      edge: rgba(mix(color, WHITE, 0.55), 0.8),
      ink: rgba(mix(color, DARK, 0.8), 1),
      gold: rgba(GOLD, 1),
      goldEdge: rgba(mix(GOLD, DARK, 0.4), 1)
    }
  },
  step(s: MoneyState, dt: number, rand: Rand): void {
    for (const f of s.bills) stepFaller(f, s, SPEC, dt, 0, rand)
  },
  draw(ctx: Ctx, s: MoneyState): void {
    ctx.globalAlpha = 0.92
    ctx.font = `bold ${FONT_PX}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const f of s.bills) {
      ctx.save()
      placeFaller(ctx, f)
      if (f.kind === COIN) drawCoin(ctx, s, f.size)
      else drawBill(ctx, s, f.size)
      ctx.restore()
    }
  }
}
