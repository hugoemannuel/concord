import type { SceneInput } from './milestoneScenes'
import {
  clamp01,
  drawGlow,
  easeOut,
  easeOutBack,
  prog,
  sparkle,
  window4,
  type Scene
} from './sceneKit'
import { makeSprite, makeVineArt, stamp, type Sprite, type VineArt } from './vinesArt'
import {
  drawFronds,
  drawVineParticles,
  makeBackdrop,
  makeFronds,
  makeVineParticles
} from './vinesForest'
import { vinesStage, type VinesStage } from './vinesGeometry'
import { drawVineLayer } from './vinesDraw'
import { makeBackLayer, makeMainLayer, makeWreathLayer } from './vinesLayer'
import {
  CROWN_FROM,
  CROWN_TO,
  fadeAt,
  SHADE_IN,
  VINES_IMPACT_MS,
  WREATH_FROM,
  WREATH_TO
} from './vinesTimeline'

/**
 * 30 · Esmeralda: na mata escura, vinhas grossas crescem dos cantos com folhas
 * e gavinhas, flores abrem e gemas acendem nos nós; uma coroa de louro fecha
 * em volta do número, a grande esmeralda pousa no topo e o clarão solta a onda
 * verde que sacode a mata. Mesmo esqueleto das outras cenas: montada uma vez,
 * com o que é caro pré-desenhado, e dentro do orçamento de partículas.
 */

export { VINES_IMPACT_MS, VINES_TITLE_MS } from './vinesTimeline'

/** Número do marco: sem o tom escuro da faixa, que sumiria no verde da mata. */
export const VINES_NUMBER_GRADIENT =
  'linear-gradient(180deg, #ffffff 0%, #c6ffe3 48%, #4fe6ad 100%)'

const TAU = Math.PI * 2
const EMERALD = '#34d399'
const EMERALD_LIGHT = '#a4fbd5'
const RAYS = 14

/** Raios verdes que giram devagar atrás da coroa, depois do impacto (cor lisa: é leve). */
function drawRays(ctx: CanvasRenderingContext2D, stage: VinesStage, t: number, fade: number): void {
  const appear = prog(t, VINES_IMPACT_MS - 40, VINES_IMPACT_MS + 300) * fade
  if (appear <= 0.01) return
  const base = t * 0.00022
  const far = stage.reach
  ctx.globalAlpha = 0.09 * appear
  ctx.fillStyle = EMERALD_LIGHT
  ctx.beginPath()
  for (let k = 0; k < RAYS; k++) {
    const a = base + (k * TAU) / RAYS
    const wide = k % 2 === 0 ? 0.06 : 0.035
    ctx.moveTo(stage.cx, stage.cy)
    ctx.lineTo(stage.cx + Math.cos(a - wide) * far, stage.cy + Math.sin(a - wide) * far)
    ctx.lineTo(stage.cx + Math.cos(a + wide) * far, stage.cy + Math.sin(a + wide) * far)
    ctx.closePath()
  }
  ctx.fill()
  ctx.globalAlpha = 1
}

/** A grande esmeralda: desce girando de leve até o topo da coroa e pisca no impacto. */
function drawCrown(
  ctx: CanvasRenderingContext2D,
  stage: VinesStage,
  art: VineArt,
  t: number,
  fade: number
): void {
  const p = prog(t, CROWN_FROM, CROWN_TO)
  if (p <= 0) return
  const x = stage.cx
  const y = stage.cy - stage.R
  const lit = window4(
    t,
    VINES_IMPACT_MS - 20,
    VINES_IMPACT_MS + 40,
    VINES_IMPACT_MS + 80,
    VINES_IMPACT_MS + 800
  )
  const pulse = 0.5 + 0.14 * Math.sin(t * 0.0048)
  const drop = (1 - easeOut(p)) * stage.crown * 2.4
  drawGlow(ctx, EMERALD, x, y, stage.crown * 3.4, fade * clamp01(p * 2) * (pulse + lit * 0.5))
  stamp(ctx, art.crown, x, y - drop, 0, stage.crown * easeOutBack(p), fade * clamp01(p * 3))
  // A estrela de brilho passa pela gema depois de pousar.
  const glint =
    0.75 * lit +
    0.55 * Math.max(0, Math.sin(t * 0.0031)) ** 6 * prog(t, VINES_IMPACT_MS, VINES_IMPACT_MS + 200)
  sparkle(
    ctx,
    x - stage.crown * 0.22,
    y - stage.crown * 0.3,
    stage.crown * 1.7,
    '#ffffff',
    fade * glint,
    t * 0.0006
  )
}

/** Clarão, duas ondas verdes e o véu sobre a tela inteira, no instante do impacto. */
function drawImpact(
  ctx: CanvasRenderingContext2D,
  stage: VinesStage,
  t: number,
  fade: number
): void {
  const flash = window4(
    t,
    VINES_IMPACT_MS - 60,
    VINES_IMPACT_MS + 10,
    VINES_IMPACT_MS + 40,
    VINES_IMPACT_MS + 460
  )
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.2 * flash
    ctx.fillStyle = EMERALD
    ctx.fillRect(0, 0, stage.w, stage.h)
    ctx.globalCompositeOperation = 'source-over'
    drawGlow(ctx, EMERALD_LIGHT, stage.cx, stage.cy, stage.R * 2.8, 0.85 * flash)
    drawGlow(ctx, '#ffffff', stage.cx, stage.cy, stage.R * 1.3, 0.7 * flash)
  }
  ctx.strokeStyle = EMERALD_LIGHT
  for (let i = 0; i < 2; i++) {
    const p = prog(t, VINES_IMPACT_MS + i * 140, VINES_IMPACT_MS + i * 140 + 950)
    if (p <= 0 || p >= 1) continue
    ctx.globalAlpha = fade * (1 - p) * 0.8
    ctx.lineWidth = stage.R * 0.07 * (1 - p) + 1
    ctx.beginPath()
    ctx.arc(stage.cx, stage.cy, stage.R * (0.92 + i * 0.05) + stage.reach * easeOut(p), 0, TAU)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** A coroa pulsa no impacto e respira de leve depois (em volta do centro). */
function wreathScale(t: number): number {
  const bounce = window4(
    t,
    VINES_IMPACT_MS,
    VINES_IMPACT_MS + 90,
    VINES_IMPACT_MS + 110,
    VINES_IMPACT_MS + 520
  )
  const breath =
    Math.sin((t - VINES_IMPACT_MS) * 0.0027) *
    0.008 *
    prog(t, VINES_IMPACT_MS, VINES_IMPACT_MS + 500)
  return 1 + 0.055 * bounce + breath
}

/** Escuro por dentro da coroa (pré-desenhado 1:1): o número se destaca do resto da cena. */
function makePlate(stage: VinesStage): Sprite {
  const radius = stage.R * 1.05
  return makeSprite(
    Math.floor(stage.cx - radius),
    Math.floor(stage.cy - radius),
    Math.ceil(radius * 2),
    Math.ceil(radius * 2),
    1,
    (g) => {
      const fill = g.createRadialGradient(
        stage.cx,
        stage.cy,
        stage.R * 0.2,
        stage.cx,
        stage.cy,
        radius
      )
      fill.addColorStop(0, 'rgba(1,22,15,.9)')
      fill.addColorStop(0.72, 'rgba(1,22,15,.74)')
      fill.addColorStop(1, 'rgba(1,22,15,0)')
      g.fillStyle = fill
      g.beginPath()
      g.arc(stage.cx, stage.cy, radius, 0, TAU)
      g.fill()
    }
  )
}

export function vinesScene(s: SceneInput, r: () => number, c0: CanvasRenderingContext2D): Scene {
  const stage = vinesStage(s)
  const art = makeVineArt(stage)
  const backdrop = makeBackdrop(stage, r)
  const fronds = makeFronds(stage)
  const back = makeBackLayer(stage, art, r, c0)
  const main = makeMainLayer(stage, art, r, c0)
  const wreath = makeWreathLayer(stage, art, r, c0)
  const particles = makeVineParticles(stage, art, r, s.budget)
  const plate = makePlate(stage)
  return {
    particles: particles.motes.length + particles.drifts.length + particles.shards.length,
    draw: (ctx, t) => {
      const fade = fadeAt(t, s.durationMs)
      stamp(ctx, backdrop, 0, 0, 0, 1, prog(t, 0, SHADE_IN) * fade)
      drawVineLayer(ctx, back, t, fade)
      drawRays(ctx, stage, t, fade)
      drawVineLayer(ctx, main, t, fade)
      stamp(ctx, plate, 0, 0, 0, 1, fade * prog(t, WREATH_FROM, WREATH_TO))
      const k = wreathScale(t)
      ctx.save()
      ctx.translate(stage.cx, stage.cy)
      ctx.scale(k, k)
      ctx.translate(-stage.cx, -stage.cy)
      drawVineLayer(ctx, wreath, t, fade)
      drawCrown(ctx, stage, art, t, fade)
      ctx.restore()
      drawFronds(ctx, fronds, art.leafNear, stage, t, fade)
      drawImpact(ctx, stage, t, fade)
      drawVineParticles(ctx, particles, t, fade)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
  }
}
