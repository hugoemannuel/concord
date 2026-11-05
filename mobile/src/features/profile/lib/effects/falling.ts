// O que caem girando têm em comum (pétalas, folhas, dinheiro): queda, balanço
// para os lados, giro e "virada" (escala no eixo). Só matemática.
import type { Ctx, Rand } from './types'
import { between, TAU } from './util'

/** Margem fora do cartão antes de reciclar, em px. */
const EDGE = 24

export interface Faller {
  x: number
  y: number
  /** Velocidade de queda, em px/s. */
  vy: number
  /** Balanço: amplitude em px/s, frequência e fase. */
  amp: number
  freq: number
  phase: number
  rot: number
  vr: number
  flip: number
  vf: number
  size: number
  /** Índice livre para a cena sortear cor ou forma. */
  kind: number
}

export interface FallerSpec {
  vy: [number, number]
  amp: [number, number]
  size: [number, number]
  /** Quantas variações de cor/forma a cena tem. */
  kinds: number
}

export interface Box {
  w: number
  h: number
}

/** Coloca no alto (`top`) ou em qualquer altura (o começo do efeito). */
export function spawnFaller(f: Faller, box: Box, spec: FallerSpec, rand: Rand, top: boolean): void {
  f.x = rand() * box.w
  f.y = top ? -between(rand, 8, 60) : rand() * box.h
  f.vy = between(rand, spec.vy[0], spec.vy[1])
  f.amp = between(rand, spec.amp[0], spec.amp[1])
  f.freq = between(rand, 0.6, 1.5)
  f.phase = rand() * TAU
  f.rot = rand() * TAU
  f.vr = between(rand, -1.6, 1.6)
  f.flip = rand() * TAU
  f.vf = between(rand, 1.2, 3.6)
  f.size = between(rand, spec.size[0], spec.size[1])
  f.kind = Math.floor(rand() * spec.kinds)
}

export function newFaller(box: Box, spec: FallerSpec, rand: Rand): Faller {
  const f: Faller = {
    x: 0,
    y: 0,
    vy: 0,
    amp: 0,
    freq: 0,
    phase: 0,
    rot: 0,
    vr: 0,
    flip: 0,
    vf: 0,
    size: 0,
    kind: 0
  }
  spawnFaller(f, box, spec, rand, false)
  return f
}

/** Avança; quem sai por baixo volta no alto e quem sai do lado, pelo outro. */
export function stepFaller(
  f: Faller,
  box: Box,
  spec: FallerSpec,
  dt: number,
  wind: number,
  rand: Rand
): void {
  f.phase = (f.phase + f.freq * dt) % TAU
  f.x += (Math.sin(f.phase) * f.amp + wind) * dt
  f.y += f.vy * dt
  f.rot = (f.rot + f.vr * dt) % TAU
  f.flip = (f.flip + f.vf * dt) % TAU
  if (f.x < -EDGE) f.x += box.w + EDGE * 2
  else if (f.x > box.w + EDGE) f.x -= box.w + EDGE * 2
  if (f.y > box.h + EDGE) spawnFaller(f, box, spec, rand, true)
}

/** Posiciona o contexto no que cai; a escala do eixo faz parecer que ele vira. */
export function placeFaller(ctx: Ctx, f: Faller): void {
  ctx.translate(f.x, f.y)
  ctx.rotate(f.rot)
  ctx.scale(1, Math.max(0.12, Math.abs(Math.cos(f.flip))))
}

/** Vento que vai e volta devagar, em px/s. */
export function breeze(t: number, strength: number): number {
  return Math.sin(t * 0.35) * strength
}
