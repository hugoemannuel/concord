// As APIs do navegador que o efeito de canvas usa, com fallback para quando
// não existem (render no servidor, testes): aí nada é observado.
import type { MountEnv } from './mount'

const noop = (): void => {}

function observeSize(el: Element, cb: (w: number, h: number) => void): () => void {
  if (typeof ResizeObserver === 'undefined') return noop
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) cb(e.contentRect.width, e.contentRect.height)
  })
  ro.observe(el)
  return () => ro.disconnect()
}

function observeVisible(el: Element, cb: (visible: boolean) => void): () => void {
  if (typeof IntersectionObserver === 'undefined') return noop
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) cb(e.isIntersecting)
  })
  io.observe(el)
  return () => io.disconnect()
}

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function watchPage(cb: (hidden: boolean) => void): () => void {
  if (typeof document === 'undefined') return noop
  const on = (): void => cb(pageHidden())
  document.addEventListener('visibilitychange', on)
  return () => document.removeEventListener('visibilitychange', on)
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scratchCanvas(): HTMLCanvasElement | null {
  return typeof document === 'undefined' ? null : document.createElement('canvas')
}

export function browserEnv(): MountEnv {
  return {
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
    dpr: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
    observeSize,
    observeVisible,
    pageHidden,
    watchPage,
    reducedMotion,
    scratchCanvas
  }
}
