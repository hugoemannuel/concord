// Pixels: invasores de fliperama descendo aos trancos, com as pernas em dois
// quadros, e uma chuva de pixels atrás. Tudo anda em passos inteiros da grade,
// para parecer jogo antigo.
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, countForArea, hexRgb, mix, rgba, WHITE, type RGB } from './util'

/** Lado de um pixel do invasor, em px. */
const PX = 3
const FRAME_SECONDS = 0.5

/** Cada invasor tem dois quadros; '#' = pixel aceso. */
export const SPRITES: readonly (readonly (readonly string[])[])[] = [
  [
    ['  #     #  ', '   #   #   ', '  #######  ', ' ## ### ## ', '###########', '# ####### #', '# #     # #', '   ## ##   '],
    ['  #     #  ', '#  #   #  #', '# ####### #', '### ### ###', '###########', ' ######### ', '  #     #  ', ' #       # ']
  ],
  [
    ['   ##   ', '  ####  ', ' ###### ', '## ## ##', '########', '  #  #  ', ' # ## # ', '# #  # #'],
    ['   ##   ', '  ####  ', ' ###### ', '## ## ##', '########', ' # ## # ', '#      #', ' #    # ']
  ],
  [
    ['    ####    ', ' ########## ', '############', '###  ##  ###', '############', '   ##  ##   ', '  ## ## ##  ', '##        ##'],
    ['    ####    ', ' ########## ', '############', '###  ##  ###', '############', '  ###  ###  ', ' ##  ##  ## ', '  ##    ##  ']
  ]
]

export interface Invader {
  x: number
  y: number
  sprite: number
  shade: number
  /** Tempo no quadro atual e o quadro (0 ou 1). */
  clock: number
  frame: number
  vy: number
  dir: number
  /** Passos andados de lado antes de voltar. */
  walked: number
}

export interface FallingPixel {
  x: number
  y: number
  v: number
  alpha: number
}

export interface PixelsState {
  w: number
  h: number
  invaders: Invader[]
  rain: FallingPixel[]
  shades: string[]
  dust: string
}

function snap(v: number): number {
  return Math.round(v / PX) * PX
}

function place(a: Invader, s: { w: number; h: number }, rand: Rand, top: boolean): void {
  a.x = snap(rand() * Math.max(PX, s.w - 12 * PX))
  a.y = snap(top ? -between(rand, 30, s.h * 0.4) : rand() * s.h)
  a.vy = between(rand, 10, 26)
}

function newInvader(s: { w: number; h: number }, rand: Rand): Invader {
  const a: Invader = {
    x: 0,
    y: 0,
    sprite: Math.floor(rand() * SPRITES.length),
    shade: Math.floor(rand() * 3),
    clock: rand() * FRAME_SECONDS,
    frame: 0,
    vy: 0,
    dir: rand() < 0.5 ? -1 : 1,
    walked: 0
  }
  place(a, s, rand, false)
  return a
}

/** A cada quadro o invasor troca as pernas, anda um pixel de lado e desce. */
function tick(a: Invader, s: PixelsState): void {
  a.frame = a.frame ? 0 : 1
  a.x = Math.min(Math.max(0, a.x + a.dir * PX), Math.max(0, s.w - 12 * PX))
  a.walked += 1
  a.y += snap(a.vy * FRAME_SECONDS)
  if (a.walked < 6) return
  a.walked = 0
  a.dir = -a.dir
}

function stepInvader(a: Invader, s: PixelsState, dt: number, rand: Rand): void {
  a.clock += dt
  while (a.clock >= FRAME_SECONDS) {
    a.clock -= FRAME_SECONDS
    tick(a, s)
  }
  if (a.y > s.h + 8 * PX) place(a, s, rand, true)
}

function drawInvader(ctx: Ctx, a: Invader, s: PixelsState): void {
  ctx.fillStyle = s.shades[a.shade]
  const rows = SPRITES[a.sprite][a.frame]
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '#') ctx.fillRect(a.x + c * PX, a.y + r * PX, PX, PX)
    }
  }
}

export const pixelsScene: Scene<PixelsState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): PixelsState {
    const color = hexRgb(p.color)
    const tones: RGB[] = [color, mix(color, WHITE, 0.4), mix(color, [0, 0, 0], 0.3)]
    return {
      w,
      h,
      invaders: Array.from({ length: countForArea(8, p.density, 20, w, h) }, () =>
        newInvader({ w, h }, rand)
      ),
      rain: Array.from({ length: countForArea(26, p.density, 70, w, h) }, () => ({
        x: snap(rand() * w),
        y: rand() * h,
        v: between(rand, 24, 90),
        alpha: between(rand, 0.18, 0.6)
      })),
      shades: tones.map((c) => rgba(c, 1)),
      dust: rgba(color, 1)
    }
  },
  step(s: PixelsState, dt: number, rand: Rand): void {
    for (const a of s.invaders) stepInvader(a, s, dt, rand)
    for (const d of s.rain) {
      d.y += d.v * dt
      if (d.y > s.h) d.y = -PX
    }
  },
  draw(ctx: Ctx, s: PixelsState): void {
    ctx.fillStyle = s.dust
    for (const d of s.rain) {
      ctx.globalAlpha = d.alpha
      ctx.fillRect(d.x, snap(d.y), PX - 1, PX - 1)
    }
    ctx.globalAlpha = 0.9
    for (const a of s.invaders) drawInvader(ctx, a, s)
  }
}
