import { drawEyes, drawHead, drawMouth, EYE_X, EYE_Y } from './jaguarArt'
import {
  drawFireflies,
  drawFrond,
  drawLeaf,
  makeFireflies,
  makeFronds,
  makeLeaves
} from './jaguarJungle'
import type { SceneInput } from './milestoneScenes'
import {
  clamp01,
  drawGlow,
  easeInOut,
  easeOut,
  easeOutBack,
  prog,
  window4,
  type Scene
} from './sceneKit'

/**
 * Cena do nível 14: no escuro da mata, dois olhos dourados se abrem (e
 * piscam); a cara da onça-pintada surge, ruge com ondas de impacto douradas
 * e o rugido sopra folhas verdes e douradas para todo lado, enquanto
 * folhagens nos cantos balançam. Mesmo esqueleto da cena do 24: tudo
 * montado uma vez (a cara é pré-desenhada num canvas escondido), nada
 * alocado por quadro, e respeita o orçamento de partículas.
 */

/** Nível com a cena da onça-pintada (decisão do dono). */
export const JAGUAR_LEVEL = 14

/** Dourados da pelagem e verdes da mata (partículas). */
export const JAGUAR_COLORS = ['#f0b54a', '#ffd27a', '#c98420', '#2f9e44', '#7cc242', '#1f6f3a']

export const JAGUAR_MS = 3200
/** O número entra logo depois do rugido. */
export const JAGUAR_TITLE_AT = 1350

// Linha do tempo (ms).
const DARK_IN = 450
const EYES_AT = 250
const HEAD_FROM = 700
const HEAD_TO = 1150
const ROAR_FROM = 1100
export const ROAR_AT = 1250
const ROAR_CLOSE = 1900
const ROAR_END = 2200

const TAU = Math.PI * 2
const SHADE = 'rgba(3,14,7,'
const RING = '#ffd27a'

export interface JaguarHead {
  x: number
  y: number
  /** Raio da cabeça (as orelhas vão um pouco além). */
  r: number
}

/** A cara fica logo acima do número, do celular ao monitor largo. */
export function jaguarHead(s: Pick<SceneInput, 'w' | 'h' | 'cx' | 'cy' | 'fontPx'>): JaguarHead {
  const r = Math.min(s.w * 0.2, s.h * 0.13)
  return { x: s.cx, y: s.cy - s.fontPx * 0.5 - r * 0.95, r }
}


interface HeadSprite {
  canvas: HTMLCanvasElement
  /** Meio lado do sprite em unidades da cabeça. */
  half: number
}

/** Pré-desenha a cara (o que não se mexe) uma vez; null se não houver contexto 2D. */
function headSprite(head: JaguarHead): HeadSprite | null {
  const half = 1.12
  const side = Math.ceil(head.r * half * 2)
  const res = Math.min(2, 1024 / side)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.round(side * res)
  const g = canvas.getContext('2d')
  if (!g) return null
  const k = head.r * res
  g.setTransform(k, 0, 0, k, (side * res) / 2, (side * res) / 2)
  drawHead(g)
  return { canvas, half }
}

function drawShade(
  ctx: CanvasRenderingContext2D,
  grad: CanvasGradient,
  s: SceneInput,
  a: number
): void {
  if (a <= 0.002) return
  ctx.globalAlpha = clamp01(a)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, s.w, s.h)
  ctx.globalAlpha = 1
}

/** Três ondas douradas saindo da boca no rugido. */
function drawRings(
  ctx: CanvasRenderingContext2D,
  s: SceneInput,
  head: JaguarHead,
  t: number,
  fade: number
): void {
  const reach = Math.max(s.w, s.h) * 0.62
  ctx.strokeStyle = RING
  for (let i = 0; i < 3; i++) {
    const p = prog(t, ROAR_AT + i * 150, ROAR_AT + i * 150 + 850)
    if (p <= 0 || p >= 1) continue
    ctx.globalAlpha = fade * (1 - p) * 0.8
    ctx.lineWidth = head.r * 0.12 * (1 - p) + 1
    ctx.beginPath()
    ctx.arc(head.x, head.y + head.r * 0.5, head.r * 0.4 + reach * easeOut(p), 0, TAU)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

interface Pose {
  x: number
  y: number
  scale: number
  alpha: number
  /** Quanto a cara já apareceu (0–1). */
  shown: number
  eyes: number
  eyesAlpha: number
  mouth: number
}

/** Onde a cara está no instante `t`: surge de baixo, avança no rugido e treme. */
function headPose(head: JaguarHead, t: number, fade: number): Pose {
  const enter = prog(t, HEAD_FROM, HEAD_TO)
  const shown = easeOut(enter)
  const mouth =
    easeOut(prog(t, ROAR_FROM, ROAR_AT)) * (1 - easeInOut(prog(t, ROAR_CLOSE, ROAR_END)))
  const lunge = window4(t, ROAR_FROM, ROAR_AT, ROAR_AT + 200, ROAR_AT + 700)
  const blink = 1 - window4(t, 600, 650, 680, 740)
  return {
    x: head.x + Math.sin(t * 0.09) * head.r * 0.015 * mouth,
    y: head.y + (1 - shown) * head.r * 0.25,
    scale: 0.88 + 0.12 * easeOutBack(enter) + 0.08 * lunge,
    alpha: fade * shown,
    shown,
    eyes: prog(t, EYES_AT, EYES_AT + 200) * blink * (1 - 0.4 * mouth),
    eyesAlpha: fade,
    mouth
  }
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  head: JaguarHead,
  sprite: HeadSprite | null,
  p: Pose
): void {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.scale(head.r * p.scale, head.r * p.scale)
  if (p.alpha > 0.002) {
    ctx.globalAlpha = p.alpha
    // Sem contexto 2D para o pré-desenho, desenha a cara direto (mais caro).
    if (sprite)
      ctx.drawImage(sprite.canvas, -sprite.half, -sprite.half, sprite.half * 2, sprite.half * 2)
    else drawHead(ctx)
    drawMouth(ctx, p.mouth)
  }
  ctx.globalAlpha = p.eyesAlpha
  drawEyes(ctx, p.eyes)
  ctx.restore()
}

/** Brilho dos olhos: forte no escuro, mais fraco quando a cara aparece. */
function drawEyeGlow(ctx: CanvasRenderingContext2D, head: JaguarHead, p: Pose): void {
  const a = p.eyesAlpha * p.eyes * (0.85 - 0.55 * p.shown)
  const k = head.r * p.scale
  for (const side of [-1, 1]) {
    drawGlow(ctx, '#ffd23f', p.x + side * EYE_X * k, p.y + EYE_Y * k, k * 0.42, a)
  }
}

export function jaguarScene(s: SceneInput, r: () => number): Scene {
  const head = jaguarHead(s)
  const fireflyCount = Math.min(8, Math.floor(s.budget * 0.15))
  const leaves = makeLeaves(
    s,
    { x: head.x, y: head.y + head.r * 0.5 },
    ROAR_AT,
    r,
    Math.max(0, s.budget - fireflyCount)
  )
  const fireflies = makeFireflies(s, r, fireflyCount)
  const fronds = makeFronds(s)
  const sprite = headSprite(head)
  let shade: CanvasGradient | null = null
  return {
    particles: leaves.length + fireflies.length,
    draw: (ctx, t) => {
      // O degradê nasce no contexto em que a cena é desenhada (uma vez só).
      shade ??= vignette(ctx, s, head)
      const fade = 1 - prog(t, s.durationMs * 0.78, s.durationMs)
      const dark = 0.62 * prog(t, 0, DARK_IN) - 0.3 * prog(t, ROAR_AT, ROAR_AT + 600)
      drawShade(ctx, shade, s, dark * fade)
      const push = window4(t, ROAR_AT, ROAR_AT + 150, ROAR_AT + 250, ROAR_AT + 900)
      for (const f of fronds) drawFrond(ctx, f, t, fade, push)
      drawRings(ctx, s, head, t, fade)
      const pose = headPose(head, t, fade)
      // O brilho vai por baixo: os olhos (e as pupilas) ficam nítidos por cima.
      drawEyeGlow(ctx, head, pose)
      drawFace(ctx, head, sprite, pose)
      // Clarão dourado do rugido e o do número quando ele entra.
      drawGlow(
        ctx,
        RING,
        head.x,
        head.y + head.r * 0.5,
        head.r * 2.2,
        0.6 * window4(t, ROAR_AT - 50, ROAR_AT + 60, ROAR_AT + 120, ROAR_AT + 700)
      )
      drawGlow(
        ctx,
        '#ffffff',
        s.cx,
        s.cy,
        s.fontPx * 1.2,
        0.45 *
          window4(
            t,
            JAGUAR_TITLE_AT,
            JAGUAR_TITLE_AT + 150,
            JAGUAR_TITLE_AT + 250,
            JAGUAR_TITLE_AT + 900
          )
      )
      drawFireflies(ctx, fireflies, t, fade)
      for (const l of leaves) drawLeaf(ctx, l, t, fade)
      ctx.globalAlpha = 1
    }
  }
}

/** Escuro da mata: mais fechado nas bordas, aberto em volta da cara. */
function vignette(ctx: CanvasRenderingContext2D, s: SceneInput, head: JaguarHead): CanvasGradient {
  const grad = ctx.createRadialGradient(
    head.x,
    head.y,
    head.r * 1.1,
    s.cx,
    s.cy,
    Math.max(s.w, s.h) * 0.8
  )
  grad.addColorStop(0, `${SHADE}0.35)`)
  grad.addColorStop(1, `${SHADE}0.95)`)
  return grad
}
