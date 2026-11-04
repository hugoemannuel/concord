import type { VinesStage } from './vinesGeometry'

/**
 * Peças da cena do marco 30, pré-desenhadas em canvas escondidos (folhas com
 * nervuras, pétalas, gemas facetadas). Por quadro a cena só copia as imagens
 * com drawImage; sem contexto 2D, a peça é desenhada direto (mais caro).
 */

type Paint = (g: CanvasRenderingContext2D) => void

export interface Sprite {
  canvas: HTMLCanvasElement | null
  /** Retângulo que a peça ocupa nas coordenadas de desenho dela. */
  x: number
  y: number
  w: number
  h: number
  paint: Paint
}

export function makeSprite(
  x: number,
  y: number,
  w: number,
  h: number,
  res: number,
  paint: Paint
): Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(w * res))
  canvas.height = Math.max(1, Math.ceil(h * res))
  const g = canvas.getContext('2d')
  if (!g) return { canvas: null, x, y, w, h, paint }
  g.setTransform(res, 0, 0, res, -x * res, -y * res)
  paint(g)
  return { canvas, x, y, w, h, paint }
}

/** Carimba a peça em (x, y), girada e na escala pedida; `squash` achata o eixo y. */
export function stamp(
  ctx: CanvasRenderingContext2D,
  sp: Sprite,
  x: number,
  y: number,
  rot: number,
  scale: number,
  alpha: number,
  squash = 1
): void {
  if (alpha <= 0.002 || scale <= 0.001) return
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.scale(scale, scale * squash)
  ctx.globalAlpha = alpha
  if (sp.canvas) ctx.drawImage(sp.canvas, sp.x, sp.y, sp.w, sp.h)
  else sp.paint(ctx)
  ctx.restore()
}

interface LeafTone {
  light: string
  mid: string
  dark: string
  vein: string
}

const LEAF_EMERALD: LeafTone = {
  light: '#6df5b6',
  mid: '#1fb57c',
  dark: '#0a6444',
  vein: '#d2ffe8'
}
const LEAF_DEEP: LeafTone = { light: '#37d594', mid: '#118a5d', dark: '#064c35', vein: '#94f3c9' }
const LEAF_LIME: LeafTone = { light: '#d4f97a', mid: '#74d150', dark: '#26803d', vein: '#f4ffc4' }
const LEAF_BACK: LeafTone = { light: '#0f7053', mid: '#0a523b', dark: '#053426', vein: '#15906a' }
const LEAF_NEAR: LeafTone = { light: '#0d5a40', mid: '#073426', dark: '#031a13', vein: '#0f5f46' }

/** Contorno da folha, da base (0, 0) até a ponta (1, 0). */
export function leafPath(g: CanvasRenderingContext2D, wide: number): void {
  g.beginPath()
  g.moveTo(0, 0)
  g.bezierCurveTo(0.16, -0.38 * wide, 0.62, -0.36 * wide, 1, 0)
  g.bezierCurveTo(0.62, 0.3 * wide, 0.16, 0.34 * wide, 0, 0)
  g.closePath()
}

const VEIN_PAIRS = 5

/** Folha dobrada na nervura central: metade clara, metade escura e veios laterais. */
function paintLeaf(g: CanvasRenderingContext2D, tone: LeafTone, wide: number): void {
  const fold = g.createLinearGradient(0, -0.34 * wide, 0, 0.32 * wide)
  fold.addColorStop(0, tone.light)
  fold.addColorStop(0.47, tone.mid)
  fold.addColorStop(0.53, tone.dark)
  fold.addColorStop(1, tone.mid)
  leafPath(g, wide)
  g.fillStyle = fold
  g.fill()
  g.strokeStyle = tone.vein
  g.lineCap = 'round'
  g.globalAlpha = 0.55
  g.lineWidth = 0.012
  g.beginPath()
  for (let i = 1; i <= VEIN_PAIRS; i++) {
    const x = (i / (VEIN_PAIRS + 1)) * 0.86
    const reach = 0.3 * wide * Math.sin(Math.PI * (x + 0.08)) * 0.82
    g.moveTo(x, 0)
    g.quadraticCurveTo(x + 0.06, -reach * 0.6, x + 0.14, -reach)
    g.moveTo(x, 0)
    g.quadraticCurveTo(x + 0.06, reach * 0.6, x + 0.14, reach)
  }
  g.stroke()
  g.globalAlpha = 1
  g.lineWidth = 0.024
  g.beginPath()
  g.moveTo(0, 0)
  g.quadraticCurveTo(0.5, -0.02, 0.96, 0)
  g.stroke()
}

/** Pétala arredondada, com a base dourada e a ponta na cor pedida. */
function paintPetal(g: CanvasRenderingContext2D, tip: string, edge: string): void {
  const fill = g.createLinearGradient(0, 0, 1, 0)
  fill.addColorStop(0, '#ffd257')
  fill.addColorStop(0.3, tip)
  fill.addColorStop(1, tip)
  g.beginPath()
  g.moveTo(0, 0)
  g.bezierCurveTo(0.18, -0.46, 0.8, -0.58, 1, -0.08)
  g.bezierCurveTo(1.04, 0.2, 0.62, 0.44, 0, 0)
  g.closePath()
  g.fillStyle = fill
  g.fill()
  g.strokeStyle = edge
  g.lineWidth = 0.035
  g.stroke()
  g.globalAlpha = 0.5
  g.beginPath()
  g.moveTo(0.1, 0)
  g.quadraticCurveTo(0.5, -0.05, 0.84, -0.06)
  g.stroke()
  g.globalAlpha = 1
}

/** Miolo da flor: um disco dourado com estames. */
function paintHeart(g: CanvasRenderingContext2D): void {
  const disc = g.createRadialGradient(-0.2, -0.2, 0.05, 0, 0, 1)
  disc.addColorStop(0, '#fff3b0')
  disc.addColorStop(0.6, '#f5b82e')
  disc.addColorStop(1, '#a4660e')
  g.fillStyle = disc
  g.beginPath()
  g.arc(0, 0, 1, 0, Math.PI * 2)
  g.fill()
}

// Corte esmeralda: a mesa no meio e 8 facetas em volta (luz vindo de cima à esquerda).
const GEM_OUTER = [
  -0.5, -1, 0.5, -1, 0.82, -0.66, 0.82, 0.66, 0.5, 1, -0.5, 1, -0.82, 0.66, -0.82, -0.66
]
const GEM_FACETS = [
  '#a4fbd5',
  '#4fe6ad',
  '#17a877',
  '#07714d',
  '#045238',
  '#08704d',
  '#23c48d',
  '#74f2c0'
]
const TABLE = 0.56

function polygon(g: CanvasRenderingContext2D, pts: number[], k: number): void {
  g.beginPath()
  g.moveTo(pts[0] * k, pts[1] * k)
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] * k, pts[i + 1] * k)
  g.closePath()
}

function paintGemFacets(g: CanvasRenderingContext2D): void {
  const n = GEM_OUTER.length
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    g.fillStyle = GEM_FACETS[i / 2]
    g.beginPath()
    g.moveTo(GEM_OUTER[i], GEM_OUTER[i + 1])
    g.lineTo(GEM_OUTER[j], GEM_OUTER[j + 1])
    g.lineTo(GEM_OUTER[j] * TABLE, GEM_OUTER[j + 1] * TABLE)
    g.lineTo(GEM_OUTER[i] * TABLE, GEM_OUTER[i + 1] * TABLE)
    g.closePath()
    g.fill()
  }
}

/** Esmeralda facetada no aro dourado, de raio 1 (a peça tem altura 2). */
function paintGem(g: CanvasRenderingContext2D): void {
  paintGemFacets(g)
  const table = g.createLinearGradient(-0.45, -0.56, 0.45, 0.56)
  table.addColorStop(0, '#8ff8cd')
  table.addColorStop(0.45, '#14b47f')
  table.addColorStop(1, '#046a48')
  polygon(g, GEM_OUTER, TABLE)
  g.fillStyle = table
  g.fill()
  // Reflexo diagonal na mesa e as arestas claras entre as facetas.
  g.globalAlpha = 0.5
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(-0.38, -0.08)
  g.lineTo(-0.02, -0.5)
  g.lineTo(0.2, -0.5)
  g.lineTo(-0.38, 0.2)
  g.closePath()
  g.fill()
  g.globalAlpha = 0.42
  g.strokeStyle = '#eafff6'
  g.lineWidth = 0.025
  polygon(g, GEM_OUTER, TABLE)
  g.stroke()
  g.globalAlpha = 1
  g.lineJoin = 'round'
  g.lineWidth = 0.1
  g.strokeStyle = '#f2cf72'
  polygon(g, GEM_OUTER, 1)
  g.stroke()
  g.lineWidth = 0.03
  g.strokeStyle = '#fff4c4'
  polygon(g, GEM_OUTER, 1.02)
  g.stroke()
}

/** Gavinha: sai reta e enrola na ponta. */
function paintTendril(g: CanvasRenderingContext2D): void {
  g.strokeStyle = '#4fe6ad'
  g.lineWidth = 0.035
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(0, 0)
  g.quadraticCurveTo(0.34, -0.14, 0.62, -0.06)
  for (let i = 1; i <= 26; i++) {
    const a = -Math.PI / 2 + i * 0.42
    const radius = 0.26 * (1 - i / 30)
    g.lineTo(0.62 + Math.cos(a) * radius, 0.2 + Math.sin(a) * radius)
  }
  g.stroke()
}

const PETALS = 5

/** Flor aberta: 5 pétalas e o miolo, de raio 1. */
function paintFlower(g: CanvasRenderingContext2D, tip: string, edge: string): void {
  for (let i = 0; i < PETALS; i++) {
    g.save()
    g.rotate((i * Math.PI * 2) / PETALS)
    paintPetal(g, tip, edge)
    g.restore()
  }
  g.save()
  g.scale(0.24, 0.24)
  paintHeart(g)
  g.restore()
}

export interface VineArt {
  leaves: Sprite[]
  leafBack: Sprite
  leafNear: Sprite
  laurels: Sprite[]
  petals: Sprite[]
  /** As mesmas flores já abertas (uma imagem só, em vez de cinco pétalas). */
  flowers: Sprite[]
  heart: Sprite
  gem: Sprite
  crown: Sprite
  tendril: Sprite
}

/** Pré-desenha as peças no tamanho que elas vão aparecer (até 2× por causa do DPR). */
export function makeVineArt(stage: VinesStage): VineArt {
  const leafRes = Math.min(160, 72 * stage.unit * 2)
  const leaf = (tone: LeafTone, wide: number, res = leafRes): Sprite =>
    makeSprite(-0.03, -0.31 * wide, 1.06, 0.62 * wide, res, (g) => paintLeaf(g, tone, wide))
  const petal = (tip: string, edge: string): Sprite =>
    makeSprite(-0.04, -0.56, 1.1, 1.06, leafRes * 0.7, (g) => paintPetal(g, tip, edge))
  const flower = (tip: string, edge: string): Sprite =>
    makeSprite(-1.1, -1.1, 2.2, 2.2, leafRes * 0.7, (g) => paintFlower(g, tip, edge))
  const gemBox = (res: number): Sprite => makeSprite(-1, -1.1, 2, 2.2, res, paintGem)
  return {
    leaves: [leaf(LEAF_EMERALD, 1), leaf(LEAF_DEEP, 1), leaf(LEAF_LIME, 0.9)],
    leafBack: leaf(LEAF_BACK, 1),
    leafNear: leaf(LEAF_NEAR, 1.02, Math.min(300, stage.R * 0.9)),
    // Louro: folha mais estreita.
    laurels: [leaf(LEAF_EMERALD, 0.74), leaf(LEAF_LIME, 0.7), leaf(LEAF_DEEP, 0.78)],
    petals: [petal('#fffdf0', '#f4e4a8'), petal('#ffd9ec', '#f58ec0')],
    flowers: [flower('#fffdf0', '#f4e4a8'), flower('#ffd9ec', '#f58ec0')],
    heart: makeSprite(-1.02, -1.02, 2.04, 2.04, 24, paintHeart),
    gem: gemBox(Math.min(44, 22 * stage.unit * 2)),
    crown: gemBox(Math.min(170, stage.crown * 2)),
    tendril: makeSprite(-0.04, -0.2, 1, 0.74, leafRes, paintTendril)
  }
}
