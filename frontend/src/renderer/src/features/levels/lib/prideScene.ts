import type { SceneInput } from './milestoneScenes'
import { drawConfetto, makeConfetti } from './confetti'
import { drawGlow, easeOut, prog, sparkle, window4, type Scene } from './sceneKit'

/**
 * Cena do nível 24: um arco-íris do orgulho atravessa a tela (as 6 faixas
 * desenhadas da esquerda para a direita), um clarão quando ele fecha e
 * confete nas 6 cores — metade estoura do número, metade chove de cima.
 * Mesmo esqueleto das cenas de marco: tudo montado uma vez, nada alocado
 * por quadro, e respeita o orçamento de partículas.
 */

/** O arco começa e termina de se desenhar (ms). */
const SWEEP_FROM = 100
const SWEEP_TO = 1300

interface Twinkle {
  x: number
  y: number
  r: number
  at: number
  color: string
}

interface Arc {
  cx: number
  cy: number
  /** Raio da faixa de fora (vermelha). */
  outer: number
  band: number
}

/** Arco grande, com o pé abaixo da tela e o topo acima do número. */
export function prideArc(s: Pick<SceneInput, 'w' | 'h'>): Arc {
  const outer = Math.min(Math.max(s.w * 0.55, s.h * 0.8), s.h * 0.95)
  return { cx: s.w / 2, cy: s.h * 1.1, outer, band: Math.max(8, outer * 0.055) }
}

function makeTwinkles(arc: Arc, r: () => number, count: number, colors: string[]): Twinkle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.PI + (0.1 + 0.8 * r()) * Math.PI
    const radius = arc.outer - r() * arc.band * 6
    return {
      x: arc.cx + Math.cos(angle) * radius,
      y: arc.cy + Math.sin(angle) * radius,
      r: 6 + r() * 8,
      at: 900 + r() * 1400,
      color: i % 3 === 0 ? colors[i % colors.length] : '#ffffff'
    }
  })
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  arc: Arc,
  colors: string[],
  t: number,
  fade: number
): void {
  const p = easeOut(prog(t, SWEEP_FROM, SWEEP_TO))
  if (p <= 0) return
  const end = Math.PI + Math.PI * p
  const head = 1 - prog(t, SWEEP_TO, SWEEP_TO + 500)
  ctx.lineWidth = arc.band + 1
  ctx.globalAlpha = fade * 0.92
  colors.forEach((color, i) => {
    const radius = arc.outer - i * arc.band
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(arc.cx, arc.cy, radius, Math.PI, end)
    ctx.stroke()
    const hx = arc.cx + Math.cos(end) * radius
    const hy = arc.cy + Math.sin(end) * radius
    drawGlow(ctx, color, hx, hy, arc.band * 1.8, head * fade)
    ctx.globalAlpha = fade * 0.92
  })
  ctx.globalAlpha = 1
}

export function prideScene(s: SceneInput, r: () => number): Scene {
  const arc = prideArc(s)
  const twinkleCount = Math.min(8, Math.floor(s.budget * 0.15))
  const confetti = makeConfetti(s, r, Math.max(0, s.budget - twinkleCount), SWEEP_TO)
  const twinkles = makeTwinkles(arc, r, twinkleCount, s.colors)
  return {
    particles: confetti.length + twinkles.length,
    draw: (ctx, t) => {
      const fade = 1 - prog(t, s.durationMs * 0.78, s.durationMs)
      drawArc(ctx, arc, s.colors, t, fade)
      // Clarão branco no número quando o arco fecha.
      drawGlow(
        ctx,
        '#ffffff',
        s.cx,
        s.cy,
        s.fontPx * 1.3,
        0.55 * window4(t, 1150, 1350, 1400, 2000)
      )
      for (const tw of twinkles) {
        sparkle(
          ctx,
          tw.x,
          tw.y,
          tw.r,
          tw.color,
          fade * window4(t, tw.at, tw.at + 200, tw.at + 300, tw.at + 700)
        )
      }
      for (const c of confetti) drawConfetto(ctx, c, t, fade)
      ctx.globalAlpha = 1
    }
  }
}
