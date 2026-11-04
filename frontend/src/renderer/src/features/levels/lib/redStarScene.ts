import type { SceneInput } from './milestoneScenes'
import {
  clamp01,
  drawGlow,
  easeIn,
  easeOut,
  prog,
  sparkle,
  starPath,
  starPoints,
  window4,
  type Scene
} from './sceneKit'

/**
 * Cena do nível 13: uma estrela vermelha gigante de 5 pontas (facetas
 * vermelhas, contorno dourado) despenca girando, bate no centro com
 * clarão e onda dourada, depois pulsa e balança entre raios que giram.
 * Faíscas estouram do impacto, estrelinhas chovem e brilhos piscam nas
 * pontas. Mesmo esqueleto da cena do 24: tudo montado uma vez, nada
 * alocado por quadro, e respeita o orçamento de partículas.
 */

export const RED_STAR_COLORS = ['#d50000', '#ff1744', '#ffd54f', '#ffb300', '#ffffff']

const RED = '#d50000'
const RED_LIT = '#ff3d3d'
const RED_SHADE = '#8e0000'
const GOLD = '#ffd54f'
const GOLD_LIGHT = '#fff3b0'

/** A estrela chega ao centro (ms): o impacto e o tremor da tela. */
const IMPACT = 350
/** Quando a estrela termina de girar e começa só a pulsar (ms). */
const SPIN_END = 1700
/** Constante de tempo do freio das faíscas (ms). */
const DRAG = 520
const GRAVITY = 0.00018
const TWO_PI = Math.PI * 2
const RAYS = 16

interface Spark {
  cos: number
  sin: number
  speed: number
  len: number
  life: number
  color: string
}

interface MiniStar {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  spin: number
  color: string
  at: number
}

interface Twinkle {
  x: number
  y: number
  r: number
  at: number
  color: string
}

export interface RedStar {
  cx: number
  cy: number
  /** Raio das pontas. */
  outer: number
}

/** Estrela grande, centrada no número, que cabe na tela e guarda o número no corpo. */
export function redStarLayout(s: Pick<SceneInput, 'w' | 'h' | 'cx' | 'cy' | 'fontPx'>): RedStar {
  const outer = Math.min(s.w * 0.46, s.h * 0.4, s.fontPx * 1.7)
  return { cx: s.cx, cy: s.cy, outer }
}

function makeSparks(s: SceneInput, r: () => number, count: number): Spark[] {
  return Array.from({ length: count }, (_, i) => {
    const a = r() * TWO_PI
    return {
      cos: Math.cos(a),
      sin: Math.sin(a),
      speed: (0.5 + r() * 0.8) * (1 + s.power * 0.5),
      len: 10 + r() * 16,
      life: 700 + r() * 800,
      color: s.colors[i % s.colors.length]
    }
  })
}

function makeMiniStars(s: SceneInput, r: () => number, count: number): MiniStar[] {
  const warm = s.colors.slice(0, 4)
  return Array.from({ length: count }, (_, i) => ({
    x: r() * s.w,
    y: -20 - r() * 60,
    vx: (r() - 0.5) * 0.06,
    vy: 0.1 + r() * 0.15,
    size: 5 + r() * 6,
    rot: r() * Math.PI,
    spin: (r() - 0.5) * 0.01,
    color: warm[i % warm.length],
    at: 300 + r() * 1700
  }))
}

function makeTwinkles(star: RedStar, r: () => number, count: number): Twinkle[] {
  return Array.from({ length: count }, (_, i) => {
    const a = r() * TWO_PI
    const d = star.outer * (0.7 + r() * 0.8)
    return {
      x: star.cx + Math.cos(a) * d,
      y: star.cy + Math.sin(a) * d,
      r: 6 + r() * 9,
      at: 700 + r() * 1700,
      color: i % 2 === 0 ? GOLD_LIGHT : '#ffffff'
    }
  })
}

/** Escala, giro e opacidade da estrela no instante `t`. */
interface Pose {
  scale: number
  rot: number
  alpha: number
}

function poseAt(t: number, out: Pose): Pose {
  const arrive = prog(t, 0, IMPACT)
  const after = Math.max(0, t - IMPACT)
  const bounce = Math.max(0, 1 - after / 380) ** 2
  const pulse = Math.sin(after * 0.0055) * 0.04 * prog(t, IMPACT, IMPACT + 400)
  out.scale = t < IMPACT ? 3.2 - 2.2 * easeIn(arrive) : 1 + 0.16 * bounce + pulse
  const spin = (1 - easeOut(prog(t, 0, SPIN_END))) * TWO_PI * 1.25
  const sway = Math.sin(t * 0.0021) * 0.05 * prog(t, SPIN_END, SPIN_END + 500)
  out.rot = -Math.PI / 2 - spin + sway
  out.alpha = clamp01(t / 160)
  return out
}

/** Facetas da estrela em coordenadas locais (ponta para cima): 10 triângulos. */
function makeFacets(outer: number): number[][] {
  const p = starPoints(0, 0, outer, -Math.PI / 2)
  const facets: number[][] = []
  for (let tip = 0; tip < 20; tip += 4) {
    const left = (tip + 18) % 20
    const right = tip + 2
    facets.push(
      [p[tip], p[tip + 1], p[left], p[left + 1]],
      [p[tip], p[tip + 1], p[right], p[right + 1]]
    )
  }
  return facets
}

function drawRays(ctx: CanvasRenderingContext2D, star: RedStar, t: number, fade: number): void {
  const appear = prog(t, IMPACT, IMPACT + 500) * fade
  if (appear <= 0.01) return
  const base = t * 0.00035
  ctx.globalAlpha = 0.28 * appear
  ctx.fillStyle = GOLD
  ctx.beginPath()
  for (let k = 0; k < RAYS; k++) {
    const a = base + (k * TWO_PI) / RAYS
    const len = star.outer * (k % 2 === 0 ? 2.3 : 1.65) * (0.88 + 0.12 * Math.sin(t * 0.004 + k))
    ctx.moveTo(star.cx, star.cy)
    ctx.lineTo(star.cx + Math.cos(a - 0.035) * len, star.cy + Math.sin(a - 0.035) * len)
    ctx.lineTo(star.cx + Math.cos(a + 0.035) * len, star.cy + Math.sin(a + 0.035) * len)
    ctx.closePath()
  }
  ctx.fill()
  ctx.globalAlpha = 1
}

function drawRing(ctx: CanvasRenderingContext2D, star: RedStar, t: number, fade: number): void {
  const p = prog(t, IMPACT, IMPACT + 800)
  if (p <= 0 || p >= 1) return
  ctx.globalAlpha = 0.85 * (1 - p) * fade
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 3 + 12 * (1 - p)
  ctx.beginPath()
  ctx.arc(star.cx, star.cy, star.outer * (0.5 + 1.8 * easeOut(p)), 0, TWO_PI)
  ctx.stroke()
  ctx.globalAlpha = 1
}

/** Corpo: 10 facetas (lado claro e lado escuro de cada ponta) e o contorno dourado. */
function drawBody(
  ctx: CanvasRenderingContext2D,
  star: RedStar,
  facets: number[][],
  edge: CanvasGradient,
  pose: Pose,
  fade: number
): void {
  ctx.save()
  ctx.translate(star.cx, star.cy)
  ctx.rotate(pose.rot)
  ctx.scale(pose.scale, pose.scale)
  ctx.globalAlpha = pose.alpha * fade
  for (let i = 0; i < facets.length; i++) {
    const f = facets[i]
    ctx.fillStyle = i % 2 === 0 ? RED_LIT : RED_SHADE
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(f[0], f[1])
    ctx.lineTo(f[2], f[3])
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = edge
  ctx.lineWidth = star.outer * 0.05
  ctx.lineJoin = 'round'
  ctx.beginPath()
  starPath(ctx, 0, 0, star.outer, -Math.PI / 2)
  ctx.stroke()
  ctx.restore()
}

function drawSpark(
  ctx: CanvasRenderingContext2D,
  sp: Spark,
  star: RedStar,
  dt: number,
  fade: number
): void {
  const alpha = fade * (1 - prog(dt, 0, sp.life))
  if (dt < 0 || alpha <= 0.01) return
  const dist = sp.speed * DRAG * (1 - Math.exp(-dt / DRAG))
  const x = star.cx + sp.cos * dist
  const y = star.cy + sp.sin * dist + 0.5 * GRAVITY * dt * dt
  ctx.globalAlpha = alpha
  ctx.strokeStyle = sp.color
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - sp.cos * sp.len * alpha, y - sp.sin * sp.len * alpha)
  ctx.stroke()
}

function drawMiniStar(ctx: CanvasRenderingContext2D, m: MiniStar, t: number, fade: number): void {
  const dt = t - m.at
  if (dt < 0) return
  ctx.save()
  ctx.translate(m.x + m.vx * dt, m.y + m.vy * dt + 0.5 * GRAVITY * dt * dt)
  ctx.rotate(m.rot + m.spin * dt)
  ctx.globalAlpha = fade * clamp01(dt / 120)
  ctx.fillStyle = m.color
  ctx.beginPath()
  starPath(ctx, 0, 0, m.size, -Math.PI / 2)
  ctx.fill()
  ctx.restore()
}

export function redStarScene(s: SceneInput, r: () => number, ctx: CanvasRenderingContext2D): Scene {
  const star = redStarLayout(s)
  const twinkleCount = Math.min(8, Math.floor(s.budget * 0.15))
  const miniCount = Math.floor(s.budget * 0.3)
  const sparks = makeSparks(s, r, Math.max(0, s.budget - twinkleCount - miniCount))
  const minis = makeMiniStars(s, r, miniCount)
  const twinkles = makeTwinkles(star, r, twinkleCount)
  const facets = makeFacets(star.outer)
  const edge = ctx.createLinearGradient(-star.outer, -star.outer, star.outer, star.outer)
  edge.addColorStop(0, GOLD_LIGHT)
  edge.addColorStop(0.5, GOLD)
  edge.addColorStop(1, '#ff9800')
  const pose: Pose = { scale: 1, rot: 0, alpha: 1 }
  return {
    particles: sparks.length + minis.length + twinkles.length,
    draw: (c, t) => {
      const fade = 1 - prog(t, s.durationMs * 0.78, s.durationMs)
      poseAt(t, pose)
      drawGlow(
        c,
        RED,
        star.cx,
        star.cy,
        star.outer * 1.9,
        pose.alpha * fade * (0.5 + 0.12 * Math.sin(t * 0.005))
      )
      drawRays(c, star, t, fade)
      drawBody(c, star, facets, edge, pose, fade)
      drawGlow(c, '#ff8a80', star.cx, star.cy, star.outer * 0.55, 0.35 * pose.alpha * fade)
      drawRing(c, star, t, fade)
      drawGlow(
        c,
        '#ffffff',
        star.cx,
        star.cy,
        star.outer * 1.4,
        0.7 * window4(t, IMPACT - 60, IMPACT + 20, IMPACT + 30, IMPACT + 500)
      )
      for (const sp of sparks) drawSpark(c, sp, star, t - IMPACT, fade)
      for (const tw of twinkles) {
        sparkle(
          c,
          tw.x,
          tw.y,
          tw.r,
          tw.color,
          fade * window4(t, tw.at, tw.at + 200, tw.at + 300, tw.at + 700)
        )
      }
      for (const m of minis) drawMiniStar(c, m, t, fade)
      c.globalAlpha = 1
    }
  }
}
