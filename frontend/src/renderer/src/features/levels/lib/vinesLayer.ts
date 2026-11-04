import type { Sprite, VineArt } from './vinesArt'
import {
  curvePoints,
  keepOutOfRing,
  makeVine,
  reachTime,
  ringPoint,
  tangentAt,
  wreathPoints,
  type Vine,
  type VinesStage
} from './vinesGeometry'
import {
  BACK_FROM,
  BACK_TO,
  BLOOM_FROM,
  MAIN_FROM,
  MAIN_STAGGER,
  MAIN_TO,
  VINES_IMPACT_MS,
  WREATH_FROM,
  WREATH_TO
} from './vinesTimeline'

/**
 * Montagem das camadas de vinhas da cena do marco 30 (fundo, principais e
 * coroa): os caminhos, com as folhas, gavinhas, flores e gemas presas neles.
 * O desenho fica em vinesDraw.ts.
 */

interface Attached {
  vine: Vine
  k: number
  at: number
  phase: number
  /** Distância até o centro (para a onda do impacto). */
  d: number
}

/** Folha ou gavinha: nasce quando a ponta passa e balança sozinha. */
export interface Bud extends Attached {
  rot: number
  size: number
  sprite: Sprite
  /** Amplitude do balanço (rad) e para que lado a onda empurra. */
  amp: number
  push: number
}

export interface Bloom extends Attached {
  size: number
  /** Qual das duas flores (índice em art.petals e art.flowers). */
  kind: number
  rot: number
}

export interface GemNode extends Attached {
  size: number
}

export interface VineTone {
  edge: string
  light: string
  /** Só as vinhas da frente têm luz, sombra e nervuras. */
  detail: boolean
  fill: CanvasGradient[]
}

export interface VineLayer {
  vines: Vine[]
  buds: Bud[]
  blooms: Bloom[]
  nodes: GemNode[]
  tone: VineTone
  art: VineArt
  stage: VinesStage
}

const distTo = (stage: VinesStage, v: Vine, k: number): number =>
  Math.hypot(v.x[k] - stage.cx, v.y[k] - stage.cy)

/** Dentro da tela, com folga para o enfeite não sair cortado. */
function inside(stage: VinesStage, v: Vine, k: number): boolean {
  const m = 30 * stage.unit
  return v.x[k] >= m && v.x[k] <= stage.w - m && v.y[k] >= m && v.y[k] <= stage.h - m
}

/** O ponto da fração `u` ou, se ele cair fora da tela, o próximo que estiver dentro. */
function pointIndex(stage: VinesStage, v: Vine, u: number): number {
  const last = v.x.length - 1
  let k = Math.round(u * last)
  while (k < last && !inside(stage, v, k)) k++
  return k
}

/** Degradê do corpo: raiz escura e ponta clara, da raiz à ponta da vinha. */
function vineFill(
  ctx: CanvasRenderingContext2D,
  v: Vine,
  stops: readonly string[]
): CanvasGradient {
  const last = v.x.length - 1
  const fill = ctx.createLinearGradient(v.x[0], v.y[0], v.x[last], v.y[last])
  stops.forEach((c, i) => fill.addColorStop(i / (stops.length - 1), c))
  return fill
}

function attach(stage: VinesStage, v: Vine, k: number, at: number, r: () => number): Attached {
  return { vine: v, k, at, phase: r() * Math.PI * 2, d: distTo(stage, v, k) }
}

/** Folhas alternadas ao longo da vinha, espaçadas pelo comprimento dela. */
function leavesAlong(
  stage: VinesStage,
  v: Vine,
  sprites: Sprite[],
  spec: { spacing: number; max: number; size: number },
  r: () => number
): Bud[] {
  const count = Math.max(4, Math.min(spec.max, Math.round(v.length / (spec.spacing * stage.unit))))
  return Array.from({ length: count }, (_, i) => {
    const k = pointIndex(stage, v, 0.08 + (0.9 * (i + r() * 0.5)) / count)
    const side = i % 2 ? 1 : -1
    return {
      ...attach(stage, v, k, reachTime(v, k), r),
      rot: tangentAt(v, k) + side * (0.6 + r() * 0.5),
      size: spec.size * stage.unit * (0.75 + r() * 0.55),
      sprite: sprites[Math.floor(r() * sprites.length)],
      amp: 0.08 + r() * 0.08,
      push: side * 0.5
    }
  })
}

function tendrilsAlong(stage: VinesStage, v: Vine, sprite: Sprite, r: () => number): Bud[] {
  return [0.34, 0.8].map((u, i) => {
    const k = pointIndex(stage, v, u)
    const side = i % 2 ? 1 : -1
    return {
      ...attach(stage, v, k, reachTime(v, k), r),
      // Sai de lado, ora para cada margem da vinha.
      rot: tangentAt(v, k) + (side * Math.PI) / 2,
      size: 34 * stage.unit,
      sprite,
      amp: 0.14,
      push: side * 0.3
    }
  })
}

function bloomsAlong(stage: VinesStage, v: Vine, us: number[], r: () => number): Bloom[] {
  return us.map((u, i) => {
    const k = pointIndex(stage, v, u)
    return {
      ...attach(stage, v, k, Math.max(BLOOM_FROM, reachTime(v, k)) + r() * 120, r),
      size: stage.unit * (15 + r() * 7),
      kind: i % 3 === 2 ? 1 : 0,
      rot: r() * Math.PI * 2
    }
  })
}

function nodesAlong(
  stage: VinesStage,
  v: Vine,
  us: number[],
  size: number,
  r: () => number
): GemNode[] {
  return us.map((u) => {
    const k = pointIndex(stage, v, u)
    return { ...attach(stage, v, k, reachTime(v, k), r), size }
  })
}

interface MainSpec {
  sx: number
  sy: number
  /** Onde encosta na coroa (graus, no sentido da tela). */
  ring: number
  bend: number
  /** No celular, de onde sai (em pé, o lado da coroa fica colado na borda). */
  tallSy?: number
}

/** Dos quatro cantos e dos dois lados até a coroa, espelhadas mas não iguais. */
const MAIN_SPECS: readonly MainSpec[] = [
  { sx: -0.02, sy: 1.03, ring: 128, bend: 0.2 },
  { sx: 1.02, sy: 1.03, ring: 52, bend: -0.22 },
  { sx: -0.02, sy: -0.03, ring: 218, bend: -0.2 },
  { sx: 1.02, sy: -0.03, ring: -38, bend: 0.19 },
  { sx: -0.02, sy: 0.6, ring: 174, bend: -0.16, tallSy: 0.8 },
  { sx: 1.02, sy: 0.48, ring: 8, bend: 0.17, tallSy: 0.16 }
]

const MAIN_STOPS = ['#0a5237', '#13885c', '#2cc98d', '#6df5b6']

export function makeMainLayer(
  stage: VinesStage,
  art: VineArt,
  r: () => number,
  ctx: CanvasRenderingContext2D
): VineLayer {
  const tall = stage.h > stage.w
  const vines = MAIN_SPECS.map((spec, i) => {
    const phase = r() * Math.PI * 2
    const { px, py } = curvePoints(
      stage,
      { x: spec.sx * stage.w, y: (tall ? (spec.tallSy ?? spec.sy) : spec.sy) * stage.h },
      ringPoint(stage, (spec.ring * Math.PI) / 180),
      spec.bend,
      phase
    )
    keepOutOfRing(stage, px, py)
    return makeVine(px, py, {
      rootHalf: 9 * stage.unit,
      tipHalf: 2.4 * stage.unit,
      from: MAIN_FROM + i * MAIN_STAGGER,
      to: MAIN_TO + i * MAIN_STAGGER,
      phase,
      sway: 5 * stage.unit
    })
  })
  const leaf = { spacing: 46, max: 10, size: 34 }
  return {
    vines,
    buds: vines.flatMap((v) => [
      ...leavesAlong(stage, v, art.leaves, leaf, r),
      ...tendrilsAlong(stage, v, art.tendril, r)
    ]),
    blooms: vines.flatMap((v) => bloomsAlong(stage, v, [0.46, 0.76], r)),
    nodes: vines.flatMap((v) => nodesAlong(stage, v, [0.56, 0.9], 9.5 * stage.unit, r)),
    tone: {
      edge: '#032016',
      light: '#b8fbdb',
      detail: true,
      fill: vines.map((v) => vineFill(ctx, v, MAIN_STOPS))
    },
    art,
    stage
  }
}

/** Cipós do fundo: pendem do alto e sobem de baixo, finos e escuros. */
const BACK_SPECS: readonly number[][] = [
  [0.16, -0.03, 0.22, 0.62],
  [0.84, -0.03, 0.78, 0.66],
  [0.36, -0.03, 0.32, 0.3],
  [0.65, -0.03, 0.7, 0.27],
  [0.06, 1.03, 0.3, 0.72],
  [0.94, 1.03, 0.7, 0.74]
]

const BACK_STOPS = ['#063d2c', '#0a5a41', '#0f7053']

export function makeBackLayer(
  stage: VinesStage,
  art: VineArt,
  r: () => number,
  ctx: CanvasRenderingContext2D
): VineLayer {
  const vines = BACK_SPECS.map(([sx, sy, ex, ey], i) => {
    const phase = r() * Math.PI * 2
    const { px, py } = curvePoints(
      stage,
      { x: sx * stage.w, y: sy * stage.h },
      { x: ex * stage.w, y: ey * stage.h },
      i % 2 ? 0.14 : -0.14,
      phase
    )
    return makeVine(px, py, {
      rootHalf: 4 * stage.unit,
      tipHalf: 1.2 * stage.unit,
      from: BACK_FROM + i * 40,
      to: BACK_TO + i * 40,
      phase,
      sway: 9 * stage.unit
    })
  })
  const leaf = { spacing: 70, max: 5, size: 26 }
  return {
    vines,
    buds: vines.flatMap((v) => leavesAlong(stage, v, [art.leafBack], leaf, r)),
    blooms: [],
    nodes: [],
    tone: {
      edge: '#03241a',
      light: '#0f7053',
      detail: false,
      fill: vines.map((v) => vineFill(ctx, v, BACK_STOPS))
    },
    art,
    stage
  }
}

const WREATH_STOPS = ['#0f7a55', '#22b67f', '#6df5b6']
const LAUREL_PAIRS = 12

/** Pares de folhas de louro ao longo do galho, para fora maiores que para dentro. */
function laurelsAlong(
  stage: VinesStage,
  v: Vine,
  side: number,
  art: VineArt,
  r: () => number
): Bud[] {
  const last = v.x.length - 1
  const buds: Bud[] = []
  const base = stage.R * 0.24
  for (let i = 0; i < LAUREL_PAIRS; i++) {
    const k = Math.round(((i + 0.5) / LAUREL_PAIRS) * last)
    const tangent = tangentAt(v, k)
    // Sentido da tela: `side` diz para que lado o galho gira; fora da coroa é -side.
    for (const out of [1, -1]) {
      buds.push({
        ...attach(stage, v, k, reachTime(v, k), r),
        rot: tangent - side * out * (0.62 + r() * 0.16),
        size: base * (out > 0 ? 1 : 0.72) * (0.88 + r() * 0.24),
        sprite: art.laurels[Math.floor(r() * art.laurels.length)],
        amp: 0.05,
        push: out * side * 0.35
      })
    }
  }
  return buds
}

/** A coroa de folhas: dois galhos que sobem pelos lados e se encontram no topo. */
export function makeWreathLayer(
  stage: VinesStage,
  art: VineArt,
  r: () => number,
  ctx: CanvasRenderingContext2D
): VineLayer {
  const sides = [1, -1]
  const vines = sides.map((side) => {
    const { px, py } = wreathPoints(stage, side)
    return makeVine(px, py, {
      rootHalf: 4.6 * stage.unit,
      tipHalf: 2 * stage.unit,
      from: WREATH_FROM,
      to: WREATH_TO,
      phase: r() * Math.PI * 2,
      sway: 0.8 * stage.unit
    })
  })
  return {
    vines,
    buds: vines.flatMap((v, i) => laurelsAlong(stage, v, sides[i], art, r)),
    blooms: vines.flatMap((v) =>
      bloomsAlong(stage, v, [0.2, 0.62], r).map((b) => ({
        ...b,
        at: Math.min(b.at, VINES_IMPACT_MS - 60),
        size: stage.R * 0.085
      }))
    ),
    // O nó de baixo (onde os galhos nascem) fica na primeira gema de um deles.
    nodes: vines.flatMap((v, i) =>
      nodesAlong(stage, v, i === 0 ? [0, 0.4, 0.82] : [0.4, 0.82], stage.R * 0.052, r)
    ),
    tone: {
      edge: '#053021',
      light: '#dcffee',
      detail: true,
      fill: vines.map((v) => vineFill(ctx, v, WREATH_STOPS))
    },
    art,
    stage
  }
}
