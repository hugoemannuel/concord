import type { SceneInput } from './milestoneScenes'
import { clamp01, easeOut, prog, sparkle, window4 } from './sceneKit'

/**
 * A mata da cena do nível 14 (jaguarScene): folhas sopradas pelo rugido e
 * caindo do alto, vaga-lumes dourados e folhagens nos 4 cantos. Tudo
 * montado uma vez; por quadro só se calcula a posição.
 */

const TAU = Math.PI * 2
const FRONDS = ['#0d3b1e', '#14532d', '#1f6f3a']
const FRONDS_PER_CORNER = 3

export interface Leaf {
  x: number
  y: number
  vx: number
  vy: number
  /** Queda constante depois do sopro (px/ms). */
  fall: number
  sway: number
  phase: number
  rot: number
  spin: number
  size: number
  color: string
  at: number
}

export interface Firefly {
  x: number
  y: number
  r: number
  at: number
}

export interface Frond {
  x: number
  y: number
  angle: number
  len: number
  /** De onde ela desliza para entrar (direção oposta à ponta). */
  side: number
  color: string
}

/** Metade das folhas sai soprada da boca no rugido; o resto cai do alto. */
export function makeLeaves(
  s: SceneInput,
  /** De onde o rugido sopra as folhas. */
  from: { x: number; y: number },
  blastAt: number,
  r: () => number,
  count: number
): Leaf[] {
  const unit = Math.min(s.w, s.h) / 700
  return Array.from({ length: count }, (_, i) => {
    const blast = i % 5 < 3
    const angle = r() * TAU
    const speed = (0.5 + r() * 0.7) * (1 + s.power) * Math.max(0.7, unit)
    return {
      x: blast ? from.x : r() * s.w,
      y: blast ? from.y : -20 - r() * 40,
      vx: blast ? Math.cos(angle) * speed : 0,
      vy: blast ? Math.sin(angle) * speed : 0,
      fall: 0.03 + r() * 0.05,
      sway: (8 + r() * 18) * unit,
      phase: r() * TAU,
      rot: r() * TAU,
      spin: (r() - 0.5) * 0.006,
      size: (7 + r() * 8) * Math.max(0.75, unit),
      color: s.colors[i % s.colors.length],
      at: blast ? blastAt + r() * 120 : r() * 1800
    }
  })
}

export function makeFireflies(s: SceneInput, r: () => number, count: number): Firefly[] {
  return Array.from({ length: count }, () => ({
    x: s.w * (0.08 + r() * 0.84),
    y: s.h * (0.05 + r() * 0.6),
    r: 4 + r() * 5,
    at: 100 + r() * 1300
  }))
}

/** Folhagem nos 4 cantos, apontando para dentro da tela. */
export function makeFronds(s: SceneInput): Frond[] {
  const len = Math.min(s.w, s.h) * 0.42
  const corners = [
    [0, 0],
    [s.w, 0],
    [0, s.h],
    [s.w, s.h]
  ]
  return corners.flatMap(([x, y]) => {
    const sx = x === 0 ? 1 : -1
    const sy = y === 0 ? 1 : -1
    const base = Math.atan2(sy * 0.55, sx)
    return Array.from({ length: FRONDS_PER_CORNER }, (_, i) => ({
      x,
      y,
      angle: base + (i - 1) * 0.42 * sx * sy,
      len: len * (1 - i * 0.16),
      side: sx,
      color: FRONDS[i % FRONDS.length]
    }))
  })
}

export function drawFrond(
  ctx: CanvasRenderingContext2D,
  f: Frond,
  t: number,
  fade: number,
  push: number
): void {
  const enter = 1 - easeOut(prog(t, 0, 650))
  const sway = Math.sin(t * 0.0018 + f.angle * 3) * 0.05 + push * 0.14 * f.side
  ctx.save()
  ctx.translate(
    f.x - Math.cos(f.angle) * f.len * 0.6 * enter,
    f.y - Math.sin(f.angle) * f.len * 0.6 * enter
  )
  ctx.rotate(f.angle + sway)
  ctx.globalAlpha = fade
  ctx.fillStyle = f.color
  const w = f.len * 0.2
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(f.len * 0.45, -w * 1.4, f.len, 0)
  ctx.quadraticCurveTo(f.len * 0.45, w * 1.4, 0, 0)
  ctx.fill()
  ctx.strokeStyle = '#2f9e44'
  ctx.lineWidth = Math.max(1, w * 0.06)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(f.len * 0.95, 0)
  ctx.stroke()
  ctx.restore()
}

export function drawLeaf(ctx: CanvasRenderingContext2D, l: Leaf, t: number, fade: number): void {
  const dt = t - l.at
  if (dt < 0) return
  const drag = 1 - Math.exp(-dt / 380)
  ctx.save()
  ctx.translate(
    l.x + l.vx * 380 * drag + Math.sin(dt * 0.004 + l.phase) * l.sway,
    l.y + l.vy * 380 * drag + l.fall * dt
  )
  ctx.rotate(l.rot + l.spin * dt)
  // Vira de um lado para o outro (ilusão de 3D).
  ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(l.phase + dt * 0.005)))
  ctx.globalAlpha = fade * clamp01(dt / 120)
  ctx.fillStyle = l.color
  ctx.beginPath()
  ctx.moveTo(-l.size, 0)
  ctx.quadraticCurveTo(0, -l.size * 0.6, l.size, 0)
  ctx.quadraticCurveTo(0, l.size * 0.6, -l.size, 0)
  ctx.fill()
  ctx.restore()
}

/** Vaga-lumes dourados piscando no escuro. */
export function drawFireflies(
  ctx: CanvasRenderingContext2D,
  list: readonly Firefly[],
  t: number,
  fade: number
): void {
  for (const f of list) {
    sparkle(
      ctx,
      f.x,
      f.y,
      f.r,
      '#ffe08a',
      fade * window4(t, f.at, f.at + 250, f.at + 500, f.at + 1100)
    )
  }
}
