// Liga uma cena a um <canvas>: tamanho (ResizeObserver, dpr ≤ 1,5), só anima
// visível na tela e com a aba à mostra, e quadro parado com
// prefers-reduced-motion. Devolve a limpeza. O ambiente vem de fora.
import { createEffectLoop } from './loop'
import { createPostFx, type PostFxSpec } from './postFx'
import type { EffectParams, Rand, Scene } from './types'

export const MAX_DPR = 1.5
/** Com mistura ou brilho, acima desta área (px do dispositivo) o quadro sai em dpr 1. */
export const POST_FX_MAX_PIXELS = 1_200_000

/** A densidade de px do canvas: os passos a mais são a tela inteira, então área grande cede. */
export function renderDpr(w: number, h: number, dpr: number, withPost: boolean): number {
  return withPost && w * h * dpr * dpr > POST_FX_MAX_PIXELS ? 1 : dpr
}

export interface MountEnv {
  raf: (cb: (time: number) => void) => number
  caf: (id: number) => void
  dpr: number
  observeSize(el: Element, cb: (w: number, h: number) => void): () => void
  observeVisible(el: Element, cb: (visible: boolean) => void): () => void
  pageHidden(): boolean
  watchPage(cb: (hidden: boolean) => void): () => void
  reducedMotion(): boolean
  /** Tela pequena do passo do brilho; sem ela, o efeito sai sem o brilho. */
  scratchCanvas?: () => HTMLCanvasElement | null
}

export interface MountOptions {
  scene: Scene
  params: EffectParams
  env: MountEnv
  rand: Rand
  /** Mistura de cor e brilho; sem isto, só o desenho da cena. */
  postFx?: PostFxSpec
}

/** Tamanho de partida antes do primeiro aviso do ResizeObserver. */
function initialSize(canvas: HTMLCanvasElement): [number, number] {
  return [canvas.clientWidth || 300, canvas.clientHeight || 400]
}

export function mountEffect(canvas: HTMLCanvasElement, o: MountOptions): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const dpr = Math.min(MAX_DPR, o.env.dpr || 1)
  const reduced = o.env.reducedMotion()
  const [w0, h0] = initialSize(canvas)
  const { raf, caf } = o.env
  const post = o.postFx
    ? createPostFx(ctx, canvas, o.postFx, o.env.scratchCanvas ?? (() => null))
    : null
  const loop = createEffectLoop({ ...o, ctx, width: w0, height: h0, raf, caf, post })
  let visible = true
  let hidden = o.env.pageHidden()

  const sync = (): void => {
    if (reduced) return
    if (visible && !hidden) loop.start()
    else loop.stop()
  }
  const fit = (w: number, h: number): void => {
    if (w <= 0 || h <= 0) return
    const d = renderDpr(w, h, dpr, post !== null)
    canvas.width = Math.round(w * d)
    canvas.height = Math.round(h * d)
    ctx.setTransform(d, 0, 0, d, 0, 0)
    loop.resize(w, h)
    if (reduced) loop.renderStill()
  }

  fit(w0, h0)
  sync()
  const offs = [
    o.env.observeSize(canvas, fit),
    o.env.observeVisible(canvas, (v) => {
      visible = v
      sync()
    }),
    o.env.watchPage((hd) => {
      hidden = hd
      sync()
    })
  ]
  return () => {
    loop.stop()
    for (const off of offs) off()
  }
}
