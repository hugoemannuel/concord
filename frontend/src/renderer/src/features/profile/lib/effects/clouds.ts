// Nuvens: chumaços de círculos num caminho só (a sobreposição não escurece), em
// planos que passam em velocidades diferentes, com a sombra na parte de baixo.
import type { Ctx, EffectParams, Rand, Scene } from './types'
import { between, countFor, hexRgb, mix, rgba, TAU, WHITE, type RGB } from './util'

const SHADOW: RGB = [71, 85, 105]

export interface Puff {
  dx: number
  dy: number
  r: number
}

export interface Cloud {
  x: number
  y: number
  v: number
  span: number
  scale: number
  alpha: number
  puffs: Puff[]
}

export interface CloudsState {
  w: number
  h: number
  clouds: Cloud[]
  light: string
  shade: string
}

function newCloud(w: number, h: number, rand: Rand): Cloud {
  const scale = between(rand, 0.55, 1.35)
  const n = 4 + Math.floor(rand() * 3)
  const puffs = Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5
    return {
      dx: t * 60 * scale,
      dy: Math.abs(t) * 10 * scale - between(rand, 2, 10) * scale,
      r: (21 - Math.abs(t) * 16 + between(rand, -2, 4)) * scale
    }
  })
  return {
    x: between(rand, -60, w + 60),
    y: between(rand, h * 0.05, h * 0.78),
    v: 7 + scale * 13,
    span: 62 * scale,
    scale,
    alpha: 0.32 + scale * 0.3,
    puffs
  }
}

function tracePuffs(ctx: Ctx, c: Cloud, dy: number, k: number): void {
  ctx.beginPath()
  for (const p of c.puffs) {
    ctx.moveTo(c.x + p.dx + p.r * k, c.y + p.dy + dy)
    ctx.arc(c.x + p.dx, c.y + p.dy + dy, p.r * k, 0, TAU)
  }
  // A base larga e achatada: o que faz parecer nuvem, não uma fila de bolas.
  const [rx, ry] = [46 * c.scale * k, 11 * c.scale * k]
  ctx.moveTo(c.x + rx, c.y + 8 * c.scale + dy)
  ctx.ellipse(c.x, c.y + 8 * c.scale + dy, rx, ry, 0, 0, TAU)
  ctx.closePath()
}

function drawCloud(ctx: Ctx, c: Cloud, s: CloudsState): void {
  ctx.globalAlpha = c.alpha
  ctx.fillStyle = s.shade
  tracePuffs(ctx, c, 3.5, 1)
  ctx.fill()
  ctx.fillStyle = s.light
  tracePuffs(ctx, c, 0, 0.97)
  ctx.fill()
}

export const cloudsScene: Scene<CloudsState> = {
  init(w: number, h: number, p: EffectParams, rand: Rand): CloudsState {
    const color = hexRgb(p.color)
    const clouds = Array.from({ length: countFor(6, p.density, 14) }, () => newCloud(w, h, rand))
    clouds.sort((a, b) => a.alpha - b.alpha)
    return {
      w,
      h,
      clouds,
      light: rgba(mix(color, WHITE, 0.2), 1),
      shade: rgba(mix(color, SHADOW, 0.55), 1)
    }
  },
  step(s: CloudsState, dt: number): void {
    for (const c of s.clouds) {
      c.x += c.v * dt
      if (c.x - c.span > s.w) c.x = -c.span
    }
  },
  draw(ctx: Ctx, s: CloudsState): void {
    for (const c of s.clouds) drawCloud(ctx, c, s)
  }
}
