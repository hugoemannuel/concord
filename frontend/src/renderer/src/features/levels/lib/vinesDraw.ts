import { drawGlow, easeOutBack, prog, sparkle } from './sceneKit'
import { stamp, type VineArt } from './vinesArt'
import { growth, updateVine, VINE_POINTS, type Vine, type VinesStage } from './vinesGeometry'
import type { Bloom, Bud, GemNode, VineLayer, VineTone } from './vinesLayer'
import { waveAt } from './vinesTimeline'

/**
 * Desenho das camadas de vinhas da cena do marco 30. Cada corpo é um único
 * polígono afinado na ponta (sem um traço por segmento) e o resto são imagens
 * pré-desenhadas (vinesArt), carimbadas por quadro.
 */

const POINTS_TAPER = 6

/** Traça o corpo até o ponto `tip` (fracionário): afina na ponta enquanto cresce. */
function traceRibbon(
  ctx: CanvasRenderingContext2D,
  v: Vine,
  tip: number,
  offset: number,
  scale: number
): void {
  const m = Math.floor(tip)
  const j = Math.min(m + 1, VINE_POINTS - 1)
  const f = tip - m
  ctx.beginPath()
  for (let k = 0; k <= m; k++) {
    const hw = v.half[k] * Math.min(1, (tip - k) / POINTS_TAPER)
    const off = hw * (offset + scale)
    ctx.lineTo(v.sx[k] + v.nx[k] * off, v.sy[k] + v.ny[k] * off)
  }
  ctx.lineTo(v.sx[m] + (v.sx[j] - v.sx[m]) * f, v.sy[m] + (v.sy[j] - v.sy[m]) * f)
  for (let k = m; k >= 0; k--) {
    const hw = v.half[k] * Math.min(1, (tip - k) / POINTS_TAPER)
    const off = hw * (offset - scale)
    ctx.lineTo(v.sx[k] + v.nx[k] * off, v.sy[k] + v.ny[k] * off)
  }
  ctx.closePath()
}

/** Nervuras: riscos diagonais curtos ao longo do corpo, um caminho só. */
function traceRibs(ctx: CanvasRenderingContext2D, v: Vine, tip: number): void {
  ctx.beginPath()
  for (let k = 1; k + 2 < tip; k += 2) {
    const hw = v.half[k] * 0.85
    ctx.moveTo(v.sx[k] + v.nx[k] * hw, v.sy[k] + v.ny[k] * hw)
    ctx.lineTo(v.sx[k + 1] - v.nx[k + 1] * hw, v.sy[k + 1] - v.ny[k + 1] * hw)
  }
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  v: Vine,
  tip: number,
  tone: VineTone,
  fill: CanvasGradient,
  fade: number
): void {
  ctx.globalAlpha = fade
  ctx.fillStyle = tone.edge
  traceRibbon(ctx, v, tip, 0, 1.3)
  ctx.fill()
  ctx.fillStyle = fill
  traceRibbon(ctx, v, tip, 0, 1)
  ctx.fill()
  if (!tone.detail) return
  ctx.globalAlpha = fade * 0.5
  ctx.strokeStyle = tone.edge
  ctx.lineWidth = Math.max(0.8, v.half[0] * 0.14)
  traceRibs(ctx, v, tip)
  ctx.stroke()
  ctx.globalAlpha = fade * 0.75
  ctx.fillStyle = tone.light
  traceRibbon(ctx, v, tip, -0.45, 0.17)
  ctx.fill()
}

function drawBud(
  ctx: CanvasRenderingContext2D,
  b: Bud,
  stage: VinesStage,
  t: number,
  fade: number
): void {
  const p = prog(t, b.at, b.at + 280)
  if (p <= 0) return
  const sway = Math.sin(t * 0.0026 + b.phase) * b.amp
  const gust = waveAt(t, b.d, stage.reach) * b.push
  const k = b.size * easeOutBack(p)
  stamp(ctx, b.sprite, b.vine.sx[b.k], b.vine.sy[b.k], b.rot + sway + gust, k, fade)
}

const PETALS = 5

function drawBloom(
  ctx: CanvasRenderingContext2D,
  f: Bloom,
  art: VineArt,
  t: number,
  fade: number
): void {
  const open = prog(t, f.at, f.at + 420)
  if (open <= 0) return
  const x = f.vine.sx[f.k]
  const y = f.vine.sy[f.k]
  const sway = Math.sin(t * 0.0018 + f.phase) * 0.05
  if (open >= 1) {
    stamp(ctx, art.flowers[f.kind], x, y, f.rot + sway, f.size, fade)
    return
  }
  const eased = easeOutBack(open)
  // Fechada a flor é um botão apertado; abrindo, as pétalas giram e alargam.
  const size = f.size * (0.4 + 0.6 * eased)
  const flat = 0.3 + 0.7 * eased
  const spin = f.rot + (1 - eased) * 0.9 + sway
  for (let i = 0; i < PETALS; i++) {
    stamp(ctx, art.petals[f.kind], x, y, spin + (i * Math.PI * 2) / PETALS, size, fade, flat)
  }
  stamp(ctx, art.heart, x, y, 0, f.size * 0.24 * eased, fade)
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  n: GemNode,
  stage: VinesStage,
  art: VineArt,
  t: number,
  fade: number
): void {
  const p = prog(t, n.at, n.at + 300)
  if (p <= 0) return
  const x = n.vine.sx[n.k]
  const y = n.vine.sy[n.k]
  const lit = waveAt(t, n.d, stage.reach)
  const pulse = 0.34 + 0.18 * Math.sin(t * 0.005 + n.phase)
  drawGlow(ctx, '#34d399', x, y, n.size * 3.4, fade * p * (pulse + lit * 0.7))
  stamp(ctx, art.gem, x, y, 0, n.size * easeOutBack(p), fade)
  // Um brilho passa de vez em quando pela gema.
  const blink = Math.max(0, Math.sin(t * 0.0042 + n.phase * 3))
  sparkle(
    ctx,
    x - n.size * 0.3,
    y - n.size * 0.4,
    n.size * 1.3,
    '#ffffff',
    fade * p * blink ** 8,
    0.3
  )
}

/** Desenha a camada: folhas por baixo, o corpo e, por cima, flores e gemas. */
export function drawVineLayer(
  ctx: CanvasRenderingContext2D,
  layer: VineLayer,
  t: number,
  fade: number
): void {
  const { vines, tone, stage, art } = layer
  for (const v of vines) updateVine(v, t)
  for (const b of layer.buds) drawBud(ctx, b, stage, t, fade)
  for (let i = 0; i < vines.length; i++) {
    const g = growth(vines[i], t)
    if (g > 0) drawBody(ctx, vines[i], g * (VINE_POINTS - 1), tone, tone.fill[i], fade)
  }
  for (const f of layer.blooms) drawBloom(ctx, f, art, t, fade)
  for (const n of layer.nodes) drawNode(ctx, n, stage, art, t, fade)
  ctx.globalAlpha = 1
}
