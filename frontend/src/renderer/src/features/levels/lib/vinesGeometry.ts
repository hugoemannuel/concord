import type { SceneInput } from './milestoneScenes'
import { prog } from './sceneKit'
import { growEase, invGrowEase } from './vinesTimeline'

/**
 * Onde as vinhas passam (cena do marco 30): a coroa em volta do número e os
 * caminhos pré-calculados, em pontos fixos. Por quadro só se calcula o
 * balanço, em arrays já alocados.
 */

export const VINE_POINTS = 48

export interface VinesStage {
  w: number
  h: number
  cx: number
  cy: number
  /** Raio da coroa de folhas. */
  R: number
  /** Raio da grande esmeralda no topo da coroa. */
  crown: number
  /** Escala de folhas e traços (1 ≈ tela de 700 px no lado menor). */
  unit: number
  /** Distância do centro até o canto mais longe. */
  reach: number
}

export function vinesStage(s: Pick<SceneInput, 'w' | 'h' | 'cx' | 'cy' | 'fontPx'>): VinesStage {
  // No celular a coroa cresce além do número para abraçar o rótulo (que quebra linha).
  const R = Math.min(s.w * 0.43, s.h * 0.38, Math.max(s.fontPx * 1.12, 140))
  return {
    w: s.w,
    h: s.h,
    cx: s.cx,
    cy: s.cy,
    R,
    crown: R * 0.2,
    unit: Math.min(1.3, Math.max(0.6, Math.min(s.w, s.h) / 700)),
    reach: Math.hypot(Math.max(s.cx, s.w - s.cx), Math.max(s.cy, s.h - s.cy))
  }
}

export interface Vine {
  /** Caminho em repouso e a normal de cada ponto. */
  x: Float32Array
  y: Float32Array
  nx: Float32Array
  ny: Float32Array
  /** Meia largura de cada ponto. */
  half: Float32Array
  /** Caminho no quadro atual, com o balanço (updateVine). */
  sx: Float32Array
  sy: Float32Array
  from: number
  to: number
  phase: number
  /** Quanto o meio da vinha balança (px). */
  sway: number
  length: number
}

export interface VineOptions {
  /** Meia largura na raiz e na ponta. */
  rootHalf: number
  tipHalf: number
  from: number
  to: number
  phase: number
  sway: number
}

/** Monta a vinha a partir dos pontos do caminho (VINE_POINTS em cada array). */
export function makeVine(px: number[], py: number[], o: VineOptions): Vine {
  const n = px.length
  const nx = new Float32Array(n)
  const ny = new Float32Array(n)
  const half = new Float32Array(n)
  let length = 0
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1)
    const b = Math.min(n - 1, k + 1)
    const dx = px[b] - px[a]
    const dy = py[b] - py[a]
    const d = Math.hypot(dx, dy) || 1
    nx[k] = -dy / d
    ny[k] = dx / d
    half[k] = o.rootHalf + (o.tipHalf - o.rootHalf) * (k / (n - 1))
    if (k > 0) length += Math.hypot(px[k] - px[k - 1], py[k] - py[k - 1])
  }
  return {
    x: Float32Array.from(px),
    y: Float32Array.from(py),
    nx,
    ny,
    half,
    sx: Float32Array.from(px),
    sy: Float32Array.from(py),
    from: o.from,
    to: o.to,
    phase: o.phase,
    sway: o.sway,
    length
  }
}

/** Para onde a vinha aponta no ponto `k` (radianos). */
export const tangentAt = (v: Vine, k: number): number => Math.atan2(-v.nx[k], v.ny[k])

/** Crescimento da vinha no instante `t` (0–1). */
export const growth = (v: Vine, t: number): number => growEase(prog(t, v.from, v.to))

/** Quando a ponta da vinha passa pelo ponto `k`. */
export function reachTime(v: Vine, k: number): number {
  return v.from + (v.to - v.from) * invGrowEase(k / (v.x.length - 1))
}

/** Calcula o balanço do quadro: a raiz fica presa e a ponta segue a coroa. */
export function updateVine(v: Vine, t: number): void {
  const n = v.x.length
  const wave = t * 0.0015 + v.phase
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1)
    const off = v.sway * Math.sin(Math.PI * u) * Math.sin(wave + u * 5)
    v.sx[k] = v.x[k] + v.nx[k] * off
    v.sy[k] = v.y[k] + v.ny[k] * off
  }
}

export interface CurvePoint {
  x: number
  y: number
}

/** Curva em S ondulada de `a` a `b`, presa ao redor da tela e fora da coroa. */
export function curvePoints(
  stage: VinesStage,
  a: CurvePoint,
  b: CurvePoint,
  bend: number,
  phase: number
): { px: number[]; py: number[] } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const px: number[] = []
  const py: number[] = []
  for (let k = 0; k < VINE_POINTS; k++) {
    const u = k / (VINE_POINTS - 1)
    const m = 1 - u
    // Bézier cúbica com os controles em lados opostos da reta: o S da vinha.
    const s = 3 * m * u * (m - u) * bend * len
    const wig = stage.unit * 12 * Math.sin(u * 11 + phase) * Math.sin(Math.PI * u)
    px.push(Math.min(stage.w + 30, Math.max(-30, a.x + dx * u + nx * (s + wig))))
    py.push(Math.min(stage.h + 30, Math.max(-30, a.y + dy * u + ny * (s + wig))))
  }
  return { px, py }
}

/** Empurra para fora o que entraria na coroa (a vinha contorna em vez de cruzar). */
export function keepOutOfRing(stage: VinesStage, px: number[], py: number[]): void {
  for (let k = 0; k < px.length; k++) {
    const dx = px[k] - stage.cx
    const dy = py[k] - stage.cy
    const d = Math.hypot(dx, dy) || 1
    if (d >= stage.R) continue
    px[k] = stage.cx + (dx / d) * stage.R
    py[k] = stage.cy + (dy / d) * stage.R
  }
}

/** Ponto da coroa no ângulo `a` (radianos, no sentido da tela). */
export const ringPoint = (stage: VinesStage, a: number): CurvePoint => ({
  x: stage.cx + Math.cos(a) * stage.R,
  y: stage.cy + Math.sin(a) * stage.R
})

/** Um galho da coroa: de baixo até o topo, para o lado `side` (±1). */
export function wreathPoints(stage: VinesStage, side: number): { px: number[]; py: number[] } {
  // Os dois galhos nascem juntos embaixo (sob a gema) e param antes do topo.
  const start = Math.PI / 2
  const sweep = side * (Math.PI - 0.16)
  const px: number[] = []
  const py: number[] = []
  for (let k = 0; k < VINE_POINTS; k++) {
    const u = k / (VINE_POINTS - 1)
    const a = start + sweep * u
    const radius = stage.R * (1 + 0.012 * Math.sin(u * 13))
    px.push(stage.cx + Math.cos(a) * radius)
    py.push(stage.cy + Math.sin(a) * radius)
  }
  return { px, py }
}
