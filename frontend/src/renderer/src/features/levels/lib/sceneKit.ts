/**
 * Utilidades das cenas desenhadas em <canvas> (marcos, cena do 24, subida
 * de nível do servidor): aleatório com semente, curvas de tempo, cores e
 * brilhos pré-desenhados. Nada aqui aloca por quadro.
 */

export interface Scene {
  draw: (ctx: CanvasRenderingContext2D, t: number) => void
  /** Partículas criadas (nunca passa do budget). */
  particles: number
}

/** Aleatório com semente: a mesma cena sai igual toda vez. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
/** Progresso 0–1 de `t` entre `a` e `b`. */
export const prog = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a))
export const easeOut = (x: number): number => 1 - (1 - x) ** 3
export const easeIn = (x: number): number => x * x * x
export const easeInOut = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
export const easeOutBack = (x: number): number => {
  const c = 1.7
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2
}
/** Sobe de 0 a 1 em [a, b] e volta a 0 em [c, d]. */
export const window4 = (t: number, a: number, b: number, c: number, d: number): number =>
  Math.min(prog(t, a, b), 1 - prog(t, c, d))

/** "#rrggbb" + alfa → "rgba(...)". Só na montagem da cena (paradas de gradiente), nunca por quadro. */
export function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16
  )
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp01(alpha).toFixed(3)})`
}

/** Brilho redondo pré-desenhado por cor (drawImage é bem mais leve que shadowBlur). */
const sprites = new Map<string, HTMLCanvasElement>()
export function glow(color: string): HTMLCanvasElement {
  let c = sprites.get(color)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, hexA('#ffffff', 1))
  grad.addColorStop(0.18, hexA(color, 0.95))
  grad.addColorStop(0.5, hexA(color, 0.3))
  grad.addColorStop(1, hexA(color, 0))
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  sprites.set(color, c)
  return c
}

export function drawGlow(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  r: number,
  alpha: number
): void {
  if (alpha <= 0.002 || r <= 0.5) return
  ctx.globalAlpha = clamp01(alpha)
  ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2)
  ctx.globalAlpha = 1
}

/** Estrelinha de 4 pontas (brilho de cristal / estrela). */
export function sparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
  rot = 0
): void {
  if (alpha <= 0.002 || r <= 0.3) return
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.globalAlpha = clamp01(alpha)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.quadraticCurveTo(0, 0, 0, r)
  ctx.quadraticCurveTo(0, 0, -r, 0)
  ctx.quadraticCurveTo(0, 0, 0, -r)
  ctx.fill()
  ctx.restore()
}

/** Razão entre o raio interno e o externo da estrela regular de 5 pontas. */
export const STAR_INNER = 0.381966

/**
 * Os 10 vértices da estrela de 5 pontas (ponta, vale, ponta, vale…), em
 * [x0, y0, x1, y1…]. Com `rot` = -π/2 a primeira ponta aponta para cima.
 */
export function starPoints(cx: number, cy: number, outer: number, rot: number): number[] {
  const out: number[] = []
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : outer * STAR_INNER
    const a = rot + (i * Math.PI) / 5
    out.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
  }
  return out
}

/** Traça (sem preencher) a estrela de 5 pontas no caminho atual. */
export function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  rot: number
): void {
  const p = starPoints(cx, cy, outer, rot)
  ctx.moveTo(p[0], p[1])
  for (let i = 2; i < 20; i += 2) ctx.lineTo(p[i], p[i + 1])
  ctx.closePath()
}
