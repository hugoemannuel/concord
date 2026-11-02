// "Segurar o dedo" no toque (o botão direito de quem não tem mouse). Só para
// pointerType touch: mouse e caneta seguem com o contextmenu de sempre.

interface PointerLike {
  pointerType: string
  clientX: number
  clientY: number
}

export interface LongPress {
  down: (e: PointerLike) => void
  move: (e: PointerLike) => void
  /** Dedo levantado, gesto cancelado ou saiu do elemento. */
  cancel: () => void
  /**
   * Disparou há pouco? O Android também manda um contextmenu no mesmo
   * gesto: quem trata o contextmenu usa isto para não abrir duas coisas.
   */
  firedRecently: () => boolean
}

const RECENT_MS = 1000

export function createLongPress(
  onFire: () => void,
  { delay = 450, tolerance = 10 }: { delay?: number; tolerance?: number } = {}
): LongPress {
  let timer: ReturnType<typeof setTimeout> | null = null
  let start = { x: 0, y: 0 }
  let firedAt = -Infinity

  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  return {
    down: (e) => {
      cancel()
      if (e.pointerType !== 'touch') return
      start = { x: e.clientX, y: e.clientY }
      timer = setTimeout(() => {
        timer = null
        firedAt = Date.now()
        onFire()
      }, delay)
    },
    move: (e) => {
      // Rolar a lista não é segurar.
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > tolerance) cancel()
    },
    cancel,
    firedRecently: () => Date.now() - firedAt < RECENT_MS
  }
}

/**
 * Engole o próximo clique (por até `ms`): depois de segurar o dedo, o
 * navegador ainda manda o clique do mesmo toque, e ele cairia no que acabou de
 * abrir embaixo do dedo (ex.: um item do menu).
 */
export function swallowNextClick(target: EventTarget, ms = 600): void {
  const stop = (e: Event): void => {
    e.preventDefault()
    e.stopImmediatePropagation()
    done()
  }
  const timer = setTimeout(() => done(), ms)
  function done(): void {
    clearTimeout(timer)
    target.removeEventListener('click', stop, { capture: true })
  }
  target.addEventListener('click', stop, { capture: true })
}
