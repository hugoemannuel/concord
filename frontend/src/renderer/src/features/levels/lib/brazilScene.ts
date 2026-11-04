import { drawConfetto, makeConfetti } from './confetti'
import type { SceneInput } from './milestoneScenes'
import {
  clamp01,
  drawGlow,
  easeOutBack,
  prog,
  sparkle,
  starPath,
  window4,
  type Scene
} from './sceneKit'

/**
 * Cena do nível 22: a bandeira do Brasil (desenhada no canvas, com as
 * proporções oficiais) entra da esquerda com força, bate no centro com um
 * clarão e passa a tremular, com confete verde, amarelo e azul estourando
 * do número e chovendo de cima. A bandeira vira um desenho escondido uma
 * vez só; por quadro ela é fatiada em faixas que sobem e descem (o vento).
 * Sem texto no globo ("Ordem e Progresso" não se lê em tamanho pequeno).
 */

const GREEN = '#009c3b'
const YELLOW = '#ffdf00'
const BLUE = '#002776'
const WHITE = '#ffffff'

/** Verde, amarelo, azul e branco; verde e amarelo em dobro para pesar mais no confete. */
export const BRAZIL_COLORS = [GREEN, YELLOW, GREEN, YELLOW, BLUE, WHITE]

/** A bandeira chega ao centro (ms): o impacto e o tremor da tela. */
const IMPACT = 750
/** A bandeira é desenhada a 1,5× e depois fatiada (nítida em tela de alta densidade). */
const ART_SCALE = 1.5
const TWO_PI = Math.PI * 2

export interface BrazilFlag {
  cx: number
  cy: number
  w: number
  h: number
}

/** Bandeira 10:7 centrada no número, que cabe do celular ao monitor largo. */
export function brazilFlagLayout(s: Pick<SceneInput, 'w' | 'h' | 'cx' | 'cy'>): BrazilFlag {
  const h = Math.min(s.h * 0.6, s.w * 0.9 * 0.7)
  return { cx: s.cx, cy: s.cy, w: (h * 10) / 7, h }
}

type Point = [number, number]

/** Losango e globo da bandeira (20×14 módulos: losango a 1,7 das bordas, globo de raio 3,5). */
export function brazilFlagGeometry(
  w: number,
  h: number
): { rhombus: Point[]; globe: { x: number; y: number; r: number }; u: number } {
  const u = h / 14
  const edge = 1.7 * u
  return {
    rhombus: [
      [edge, h / 2],
      [w / 2, edge],
      [w - edge, h / 2],
      [w / 2, h - edge]
    ],
    globe: { x: w / 2, y: h / 2, r: 3.5 * u },
    u
  }
}

/** Estrelas do globo: posição (em raios, a partir do centro) e tamanho (em raios). */
const GLOBE_STARS: [number, number, number][] = [
  [-0.55, 0.45, 0.1],
  [-0.2, 0.72, 0.09],
  [0.15, 0.55, 0.12],
  [0.45, 0.42, 0.09],
  [0.06, 0.86, 0.07],
  [0.62, 0.72, 0.07],
  [-0.3, -0.6, 0.08],
  [0.1, -0.72, 0.1],
  [0.5, -0.45, 0.08],
  [-0.68, -0.2, 0.07],
  [0.72, -0.05, 0.07],
  [-0.1, -0.36, 0.07]
]

function fillPolygon(g: CanvasRenderingContext2D, points: Point[], color: string): void {
  g.fillStyle = color
  g.beginPath()
  g.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1])
  g.closePath()
  g.fill()
}

/** A faixa branca: arco de raio 8 módulos que cruza o globo subindo para a direita. */
function drawBand(g: CanvasRenderingContext2D, globe: { x: number; y: number }, u: number): void {
  const radius = 8 * u
  const theta = Math.PI / 3
  const cx = globe.x + Math.cos(theta) * radius
  const cy = globe.y + Math.sin(theta) * radius
  g.strokeStyle = WHITE
  g.lineWidth = 0.95 * u
  g.beginPath()
  g.arc(cx, cy, radius, Math.PI * 1.05, Math.PI * 1.6)
  g.stroke()
}

/** Desenha a bandeira inteira (sem texto) em `g`, num desenho de `w`×`h`. */
function drawFlagArt(g: CanvasRenderingContext2D, w: number, h: number): void {
  const { rhombus, globe, u } = brazilFlagGeometry(w, h)
  g.fillStyle = GREEN
  g.fillRect(0, 0, w, h)
  fillPolygon(g, rhombus, YELLOW)
  g.fillStyle = BLUE
  g.beginPath()
  g.arc(globe.x, globe.y, globe.r, 0, TWO_PI)
  g.fill()
  g.save()
  g.beginPath()
  g.arc(globe.x, globe.y, globe.r, 0, TWO_PI)
  g.clip()
  drawBand(g, globe, u)
  g.restore()
  g.fillStyle = WHITE
  g.beginPath()
  for (const [sx, sy, sr] of GLOBE_STARS) {
    starPath(g, globe.x + sx * globe.r, globe.y + sy * globe.r, sr * globe.r, -Math.PI / 2)
  }
  g.fill()
}

/**
 * Quanto a faixa em `x` (0 = mastro, 1 = ponta) sobe ou desce, em px, no
 * instante `t` (ms). O mastro fica quase parado; a ponta balança mais.
 */
export function flagWave(x: number, t: number, amp: number): number {
  return amp * Math.sin(x * TWO_PI * 1.3 - t * 0.006) * (0.1 + 0.9 * x)
}

interface Twinkle {
  x: number
  y: number
  r: number
  at: number
  color: string
}

function makeTwinkles(flag: BrazilFlag, r: () => number, count: number): Twinkle[] {
  return Array.from({ length: count }, (_, i) => ({
    x: flag.cx + (r() - 0.5) * flag.w * 1.1,
    y: flag.cy + (r() - 0.5) * flag.h * 1.1,
    r: 6 + r() * 8,
    at: 900 + r() * 1500,
    color: i % 2 === 0 ? YELLOW : WHITE
  }))
}

/** Onde está a bandeira no instante `t`: entra da esquerda girando, bate e assenta. */
interface Pose {
  dx: number
  rot: number
  scale: number
  alpha: number
  /** Quanto o vento balança (px), forte na chegada e mais calmo depois. */
  amp: number
}

function poseAt(t: number, flag: BrazilFlag, out: Pose): Pose {
  const arrive = easeOutBack(prog(t, 0, IMPACT))
  const settle = 1 - prog(t, IMPACT, IMPACT + 1400)
  out.dx = -flag.w * 0.9 * (1 - arrive)
  out.rot = -0.35 * (1 - arrive)
  out.scale = 0.7 + 0.3 * arrive + 0.05 * Math.max(0, 1 - (t - IMPACT) / 300) ** 2
  out.alpha = clamp01(t / 200)
  out.amp = flag.h * (0.03 + 0.05 * settle)
  return out
}

/** A bandeira em faixas verticais: cada uma sobe/desce com o vento e ganha luz ou sombra. */
function drawFlag(
  ctx: CanvasRenderingContext2D,
  flag: BrazilFlag,
  art: HTMLCanvasElement,
  strips: number,
  pose: Pose,
  t: number,
  fade: number
): void {
  const sw = art.width / strips
  const dw = flag.w / strips
  ctx.save()
  ctx.translate(flag.cx + pose.dx, flag.cy)
  ctx.rotate(pose.rot)
  ctx.scale(pose.scale, pose.scale)
  ctx.globalAlpha = pose.alpha * fade
  for (let i = 0; i < strips; i++) {
    const x01 = i / strips
    const dx = -flag.w / 2 + i * dw
    const dy = -flag.h / 2 + flagWave(x01, t, pose.amp)
    ctx.drawImage(art, i * sw, 0, sw + 0.5, art.height, dx, dy, dw + 0.6, flag.h)
    // Luz e sombra seguem a inclinação da onda.
    const slope = Math.cos(x01 * TWO_PI * 1.3 - t * 0.006) * (0.1 + 0.9 * x01) * 0.16
    ctx.fillStyle = slope > 0 ? WHITE : '#000000'
    ctx.globalAlpha = Math.abs(slope) * pose.alpha * fade
    ctx.fillRect(dx, dy, dw + 0.6, flag.h)
    ctx.globalAlpha = pose.alpha * fade
  }
  ctx.restore()
}

function makeArt(flag: BrazilFlag): HTMLCanvasElement {
  const art = document.createElement('canvas')
  art.width = Math.round(flag.w * ART_SCALE)
  art.height = Math.round(flag.h * ART_SCALE)
  const g = art.getContext('2d')!
  g.scale(ART_SCALE, ART_SCALE)
  drawFlagArt(g, flag.w, flag.h)
  return art
}

export function brazilScene(s: SceneInput, r: () => number, ctx: CanvasRenderingContext2D): Scene {
  const flag = brazilFlagLayout(s)
  const art = makeArt(flag)
  const strips = Math.max(32, Math.min(120, Math.round(flag.w / 6)))
  const twinkleCount = Math.min(8, Math.floor(s.budget * 0.15))
  const confetti = makeConfetti(s, r, Math.max(0, s.budget - twinkleCount), IMPACT)
  const twinkles = makeTwinkles(flag, r, twinkleCount)
  // Escurece de leve a bandeira atrás do número para ele se ler.
  const radius = s.fontPx * 1.15
  const scrim = ctx.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, radius)
  scrim.addColorStop(0, 'rgba(0,24,10,0.55)')
  scrim.addColorStop(1, 'rgba(0,24,10,0)')
  const pose: Pose = { dx: 0, rot: 0, scale: 1, alpha: 1, amp: 0 }
  return {
    particles: confetti.length + twinkles.length,
    draw: (c, t) => {
      const fade = 1 - prog(t, s.durationMs * 0.78, s.durationMs)
      poseAt(t, flag, pose)
      drawFlag(c, flag, art, strips, pose, t, fade)
      c.globalAlpha = fade * prog(t, 500, 1000)
      c.fillStyle = scrim
      c.fillRect(s.cx - radius, s.cy - radius, radius * 2, radius * 2)
      drawGlow(
        c,
        YELLOW,
        s.cx,
        s.cy,
        s.fontPx * 1.6,
        0.6 * window4(t, IMPACT - 60, IMPACT + 20, IMPACT + 30, IMPACT + 600)
      )
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
      for (const cf of confetti) drawConfetto(c, cf, t, fade)
      c.globalAlpha = 1
    }
  }
}
