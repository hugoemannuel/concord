// Passos depois do desenho da cena, em tela (valem para qualquer cena): a mistura
// de cor pinta só o que já está desenhado (source-atop) e o brilho reduz o quadro
// numa tela pequena e soma de volta ampliado, o que dá o halo por uma fração do
// custo de shadowBlur (ADR 0054). Sem nada escolhido não há passo nenhum.

/** O que os dois passos usam do contexto do canvas. */
export type PostCtx = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'fillRect'
  | 'createLinearGradient'
  | 'drawImage'
  | 'fillStyle'
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'imageSmoothingEnabled'
>

export interface PostFxSpec {
  palette: string
  color: string
  color2: string
  /** 0 a 1. */
  glow: number
}

export type PostFx = (w: number, h: number, t: number) => void

/** Um pouco de transparência deixa aparecer o sombreado da própria cena. */
const TINT_ALPHA = 0.9
const RAINBOW_STOPS = 7
const RAINBOW_DEG_PER_S = 40
/** Quantas vezes o quadro encolhe no passo do brilho. */
const GLOW_DOWN = 6

/** As paradas do degradê da mistura em t segundos; [] = não pinta. */
export function tintStops(palette: string, color: string, color2: string, t: number): [number, string][] {
  if (palette === 'duo') {
    return [
      [0, color],
      [1, color2]
    ]
  }
  if (palette !== 'rainbow') return []
  const shift = t * RAINBOW_DEG_PER_S
  return Array.from({ length: RAINBOW_STOPS }, (_, i) => {
    const hue = Math.round(i * 60 + shift) % 360
    return [i / (RAINBOW_STOPS - 1), `hsl(${hue} 92% 62%)`]
  })
}

function tint(ctx: PostCtx, spec: PostFxSpec, w: number, h: number, t: number): void {
  const stops = tintStops(spec.palette, spec.color, spec.color2, t)
  if (stops.length === 0) return
  ctx.save()
  const fill = ctx.createLinearGradient(0, 0, w, h)
  for (const [at, c] of stops) fill.addColorStop(at, c)
  ctx.globalCompositeOperation = 'source-atop'
  ctx.globalAlpha = TINT_ALPHA
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/** Prepara o passo do brilho; sem tela pequena (ambiente sem DOM), fica sem brilho. */
function glowPass(
  ctx: PostCtx,
  source: HTMLCanvasElement,
  strength: number,
  makeScratch: () => HTMLCanvasElement | null
): PostFx | null {
  const scratch = strength > 0 ? makeScratch() : null
  const small = scratch?.getContext('2d')
  if (!scratch || !small) return null
  return (w, h) => {
    const sw = Math.max(1, Math.ceil(w / GLOW_DOWN))
    const sh = Math.max(1, Math.ceil(h / GLOW_DOWN))
    // Atribuir o tamanho já limpa a tela; quando não muda, limpa à mão.
    if (scratch.width !== sw || scratch.height !== sh) {
      scratch.width = sw
      scratch.height = sh
    } else {
      small.clearRect(0, 0, sw, sh)
    }
    small.imageSmoothingQuality = 'medium'
    small.drawImage(source, 0, 0, sw, sh)
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = strength
    ctx.drawImage(scratch, 0, 0, w, h)
    ctx.restore()
  }
}

/** Os passos do efeito, ou null se não há o que fazer. */
export function createPostFx(
  ctx: PostCtx,
  source: HTMLCanvasElement,
  spec: PostFxSpec,
  makeScratch: () => HTMLCanvasElement | null
): PostFx | null {
  const tinted = spec.palette === 'duo' || spec.palette === 'rainbow'
  if (!tinted && spec.glow <= 0) return null
  const glow = glowPass(ctx, source, spec.glow, makeScratch)
  return (w, h, t) => {
    if (tinted) tint(ctx, spec, w, h, t)
    glow?.(w, h, t)
  }
}
