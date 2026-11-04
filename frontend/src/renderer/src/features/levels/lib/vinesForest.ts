import { clamp01, drawGlow, easeOut, prog, rng, sparkle, window4 } from './sceneKit'
import { leafPath, makeSprite, stamp, type Sprite, type VineArt } from './vinesArt'
import type { VinesStage } from './vinesGeometry'
import { VINES_IMPACT_MS, waveAt } from './vinesTimeline'

/**
 * O entorno das vinhas na cena do marco 30: o fundo escuro da mata
 * (pré-desenhado), as folhagens na frente, e as partículas (vaga-lumes,
 * pólen, folhas caindo e o estouro do impacto).
 */

const TAU = Math.PI * 2
/** O fundo fica em 1/4 da resolução: ampliado, sai desfocado (sem filtro caro). */
const BACKDROP_RES = 0.25

function paintTrunks(g: CanvasRenderingContext2D, s: VinesStage, r: () => number): void {
  const n = 7
  g.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.2 + r() * 0.6) / n) * s.w
    const lean = (r() - 0.5) * s.w * 0.06
    g.strokeStyle = i % 2 ? '#04261b' : '#052e21'
    g.lineWidth = s.unit * (14 + r() * 34)
    g.globalAlpha = 0.55
    g.beginPath()
    g.moveTo(x, -20)
    g.quadraticCurveTo(x + lean, s.h * 0.5, x - lean * 0.5, s.h + 20)
    g.stroke()
  }
  g.globalAlpha = 1
}

/** Feixes de luz descendo pela copa das árvores. */
function paintShafts(g: CanvasRenderingContext2D, s: VinesStage, r: () => number): void {
  const beam = g.createLinearGradient(0, 0, 0, s.h * 0.85)
  beam.addColorStop(0, 'rgba(150,255,214,.2)')
  beam.addColorStop(1, 'rgba(150,255,214,0)')
  g.fillStyle = beam
  for (let i = 0; i < 5; i++) {
    const x = s.w * (0.12 + i * 0.19 + r() * 0.06)
    const top = s.unit * (18 + r() * 34)
    const drift = s.w * (0.5 - x / s.w) * 0.34
    g.beginPath()
    g.moveTo(x - top, -10)
    g.lineTo(x + top, -10)
    g.lineTo(x + drift + top * 2.8, s.h * 0.85)
    g.lineTo(x + drift - top * 2.8, s.h * 0.85)
    g.closePath()
    g.fill()
  }
}

/** Silhuetas de folhas grandes pelas bordas (a mata fechada). */
function paintUndergrowth(g: CanvasRenderingContext2D, s: VinesStage, r: () => number): void {
  const size = Math.min(s.w, s.h) * 0.3
  const perSide = Math.round(s.w / (size * 0.42))
  for (let i = 0; i < perSide * 2; i++) {
    const top = i % 2 === 0
    const x = ((i + r()) / (perSide * 2)) * s.w
    g.save()
    g.translate(x, top ? -size * 0.08 : s.h + size * 0.08)
    g.rotate((top ? 1 : -1) * (Math.PI / 2 + (r() - 0.5) * 1.5))
    g.scale(size * (0.7 + r() * 0.6), size * (0.7 + r() * 0.6))
    leafPath(g, 1)
    g.fillStyle = i % 3 === 0 ? '#06382a' : '#042a1f'
    g.fill()
    g.restore()
  }
}

/** A mata inteira, em tela cheia, desenhada uma vez. */
export function makeBackdrop(s: VinesStage, r: () => number): Sprite {
  // Sorteia uma vez: o desenho direto (sem contexto 2D) sai igual a cada quadro.
  const seed = Math.floor(r() * 1e9)
  const paint = (g: CanvasRenderingContext2D): void => {
    const local = rng(seed)
    const sky = g.createRadialGradient(s.cx, s.cy, s.R * 0.2, s.cx, s.cy, s.reach)
    sky.addColorStop(0, '#0e5a42')
    sky.addColorStop(0.32, '#07382a')
    sky.addColorStop(0.7, '#031a13')
    sky.addColorStop(1, '#010b07')
    g.fillStyle = sky
    g.fillRect(0, 0, s.w, s.h)
    paintTrunks(g, s, local)
    paintShafts(g, s, local)
    paintUndergrowth(g, s, local)
  }
  const small = makeSprite(0, 0, s.w, s.h, BACKDROP_RES, paint)
  if (!small.canvas) return small
  // Ampliado uma vez: por quadro é uma cópia 1:1, bem mais leve que reamostrar a tela toda.
  const source = small.canvas
  return makeSprite(0, 0, s.w, s.h, 1, (g) => g.drawImage(source, 0, 0, s.w, s.h))
}

export interface Frond {
  x: number
  y: number
  angle: number
  len: number
  phase: number
}

/** Folhagem escura na frente, nos quatro cantos: dá profundidade às vinhas. */
export function makeFronds(s: VinesStage): Frond[] {
  const len = Math.min(s.w, s.h) * 0.3
  const out: Frond[] = []
  for (const [x, y, base] of [
    [0, 0, 0.72],
    [s.w, 0, Math.PI - 0.72],
    [0, s.h, -0.72],
    [s.w, s.h, Math.PI + 0.72]
  ]) {
    for (let i = 0; i < 2; i++) {
      out.push({
        x,
        y,
        angle: base + (i - 0.5) * 0.7,
        len: len * (1 - i * 0.14),
        phase: x + y + i
      })
    }
  }
  return out
}

export function drawFronds(
  ctx: CanvasRenderingContext2D,
  fronds: Frond[],
  sprite: Sprite,
  stage: VinesStage,
  t: number,
  fade: number
): void {
  const enter = easeOut(prog(t, 0, 700))
  for (const f of fronds) {
    const d = Math.hypot(f.x - stage.cx, f.y - stage.cy)
    const push = waveAt(t, d * 0.7, stage.reach) * 0.14
    const rot = f.angle + Math.sin(t * 0.0013 + f.phase) * 0.035 + push
    const back = (1 - enter) * f.len * 0.5
    stamp(
      ctx,
      sprite,
      f.x - Math.cos(f.angle) * back,
      f.y - Math.sin(f.angle) * back,
      rot,
      f.len,
      fade
    )
  }
}

/** Pólen sobe devagar; vaga-lume é maior e pisca (cada um no seu ritmo). */
interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
  at: number
  firefly: boolean
  color: string
}

/** Folha ou pétala caindo, virando no ar. */
interface Drift {
  x: number
  y: number
  vy: number
  sway: number
  size: number
  rot: number
  spin: number
  flip: number
  phase: number
  at: number
  sprite: Sprite
}

/** Folha ou brilho arremessado da coroa no impacto. */
interface Shard {
  cos: number
  sin: number
  speed: number
  size: number
  rot: number
  spin: number
  life: number
  sprite: Sprite | null
}

export interface VineParticles {
  motes: Mote[]
  drifts: Drift[]
  shards: Shard[]
  stage: VinesStage
}

const MOTE_COLORS = ['#ffd257', '#d4f97a', '#a4fbd5']

function makeMotes(s: VinesStage, r: () => number, count: number): Mote[] {
  return Array.from({ length: count }, (_, i) => {
    const firefly = i % 3 === 0
    return {
      x: r() * s.w,
      y: s.h * (0.1 + r() * 0.9),
      vx: (r() - 0.5) * 0.02,
      vy: -(0.008 + r() * 0.03) * s.unit,
      r: s.unit * (firefly ? 9 + r() * 7 : 2.5 + r() * 2.5),
      phase: r() * TAU,
      at: 150 + r() * 1000,
      firefly,
      color: firefly ? '#d4f97a' : MOTE_COLORS[i % MOTE_COLORS.length]
    }
  })
}

function makeDrifts(s: VinesStage, art: VineArt, r: () => number, count: number): Drift[] {
  const pool = [...art.leaves, art.petals[0], art.petals[1]]
  return Array.from({ length: count }, (_, i) => ({
    x: r() * s.w,
    y: -30 - r() * s.h * 0.3,
    vy: (0.13 + r() * 0.14) * s.unit,
    sway: s.unit * (14 + r() * 26),
    size: s.unit * (15 + r() * 14),
    rot: r() * TAU,
    spin: (r() - 0.5) * 0.003,
    flip: 0.003 + r() * 0.004,
    phase: r() * TAU,
    at: 500 + r() * 1700,
    sprite: pool[i % pool.length]
  }))
}

function makeShards(s: VinesStage, art: VineArt, r: () => number, count: number): Shard[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / Math.max(1, count)) * TAU + r() * 0.4
    return {
      cos: Math.cos(a),
      sin: Math.sin(a),
      speed: (0.5 + r() * 0.75) * s.unit,
      size: s.unit * (14 + r() * 14),
      rot: r() * TAU,
      spin: (r() - 0.5) * 0.008,
      life: 800 + r() * 900,
      sprite: i % 3 === 2 ? null : art.laurels[i % art.laurels.length]
    }
  })
}

/** Reparte o orçamento: 40% no estouro, 30% caindo, o resto no ar. */
export function makeVineParticles(
  s: VinesStage,
  art: VineArt,
  r: () => number,
  budget: number
): VineParticles {
  const shards = Math.floor(budget * 0.4)
  const drifts = Math.floor(budget * 0.3)
  return {
    motes: makeMotes(s, r, Math.max(0, budget - shards - drifts)),
    drifts: makeDrifts(s, art, r, drifts),
    shards: makeShards(s, art, r, shards),
    stage: s
  }
}

function drawMote(ctx: CanvasRenderingContext2D, m: Mote, t: number, fade: number): void {
  const dt = t - m.at
  if (dt <= 0) return
  const x = m.x + m.vx * dt + Math.sin(dt * 0.0016 + m.phase) * 16
  const y = m.y + m.vy * dt + Math.cos(dt * 0.0021 + m.phase) * 10
  const blink = m.firefly ? 0.3 + 0.7 * Math.sin(dt * 0.0052 + m.phase) ** 2 : 0.8
  drawGlow(ctx, m.color, x, y, m.r, fade * clamp01(dt / 300) * blink)
}

function drawDrift(
  ctx: CanvasRenderingContext2D,
  d: Drift,
  t: number,
  fade: number,
  gust: number
): void {
  const dt = t - d.at
  if (dt <= 0) return
  const x = d.x + Math.sin(dt * 0.0018 + d.phase) * d.sway + gust * d.sway * 2
  const flat = 0.35 + 0.65 * Math.abs(Math.cos(dt * d.flip + d.phase))
  stamp(
    ctx,
    d.sprite,
    x,
    d.y + d.vy * dt,
    d.rot + d.spin * dt,
    d.size,
    fade * clamp01(dt / 200),
    flat
  )
}

const DRAG = 480

function drawShard(
  ctx: CanvasRenderingContext2D,
  sh: Shard,
  s: VinesStage,
  dt: number,
  fade: number
): void {
  const a = fade * (1 - prog(dt, sh.life * 0.55, sh.life))
  if (a <= 0.01) return
  const dist = s.R * 0.9 + sh.speed * DRAG * (1 - Math.exp(-dt / DRAG))
  const x = s.cx + sh.cos * dist
  const y = s.cy + sh.sin * dist + 0.00011 * dt * dt
  if (sh.sprite) stamp(ctx, sh.sprite, x, y, sh.rot + sh.spin * dt, sh.size, a)
  else sparkle(ctx, x, y, sh.size * 0.55, '#d4f97a', a * window4(dt, 0, 80, 400, sh.life), sh.rot)
}

export function drawVineParticles(
  ctx: CanvasRenderingContext2D,
  p: VineParticles,
  t: number,
  fade: number
): void {
  for (const m of p.motes) drawMote(ctx, m, t, fade)
  const gust = window4(
    t,
    VINES_IMPACT_MS,
    VINES_IMPACT_MS + 220,
    VINES_IMPACT_MS + 300,
    VINES_IMPACT_MS + 1000
  )
  for (const d of p.drifts) drawDrift(ctx, d, t, fade, gust)
  const dt = t - VINES_IMPACT_MS
  if (dt < 0) return
  for (const sh of p.shards) drawShard(ctx, sh, p.stage, dt, fade)
}
