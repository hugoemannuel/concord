// O gesto de arrastar com eventos de ponteiro, igual para mouse e toque (o
// arrastar nativo do navegador não funciona no toque). Mouse: começa ao andar
// alguns pixels. Toque: começa ao segurar parado; mexer antes disso é rolagem.
// Sem React: quem usa injeta o que acontece em cada fase (ver useSidebarDrag).

export const HOLD_MS = 280
const MOUSE_SLOP = 5
const TOUCH_SLOP = 10
const PEEK_MS = 600

export interface GestureEnv {
  /** Onde ouvir os eventos (a janela). */
  events: EventTarget
  requestFrame: (callback: () => void) => number
  cancelFrame: (id: number) => void
  /** O arrasto começou. */
  activate: () => void
  /** O ponteiro está neste ponto (ou a lista rolou por baixo dele). */
  move: (x: number, y: number) => void
  /** Rola a lista perto das bordas; true se ela andou. */
  autoScroll: (y: number) => boolean
  /** O arrasto terminou: `drop` = soltou (e não cancelou). */
  finish: (drop: boolean) => void
}

export interface PressInfo {
  pointerId: number
  pointerType: string
  x: number
  y: number
}

/** Evita o clique que o navegador dispara ao soltar: ele abriria o canal. */
function swallowNextClick(events: EventTarget): void {
  const swallow = (event: Event): void => {
    event.preventDefault()
    event.stopPropagation()
  }
  events.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => events.removeEventListener('click', swallow, { capture: true }), 0)
}

/** Acompanha um toque/clique na linha até virar arrasto ou desistir. Devolve o cancelar. */
export function startDragGesture(env: GestureEnv, press: PressInfo): () => void {
  const touch = press.pointerType !== 'mouse'
  const slop = touch ? TOUCH_SLOP : MOUSE_SLOP
  let active = false
  let last = { x: press.x, y: press.y }
  let frame: number | null = null
  let hold: ReturnType<typeof setTimeout> | null = null

  const tick = (): void => {
    if (env.autoScroll(last.y)) env.move(last.x, last.y)
    frame = env.requestFrame(tick)
  }
  const activate = (): void => {
    active = true
    env.activate()
    env.move(last.x, last.y)
    frame = env.requestFrame(tick)
  }
  const stop = (): void => {
    if (hold !== null) clearTimeout(hold)
    if (frame !== null) env.cancelFrame(frame)
    listeners.forEach(([type, listener, options]) => env.events.removeEventListener(type, listener, options))
  }
  const end = (drop: boolean): void => {
    stop()
    if (!active) return
    swallowNextClick(env.events)
    env.finish(drop)
  }
  const whileActive = (event: Event): void => {
    if (active) event.preventDefault()
  }
  const movedFarEnough = (x: number, y: number): boolean => Math.hypot(x - press.x, y - press.y) >= slop
  const beforeActive = (x: number, y: number): void => {
    if (!movedFarEnough(x, y)) return
    if (touch) stop()
    else activate()
  }
  const onMove = (event: Event): void => {
    const { pointerId, clientX, clientY } = event as PointerEvent
    if (pointerId !== press.pointerId) return
    last = { x: clientX, y: clientY }
    if (active) env.move(clientX, clientY)
    else beforeActive(clientX, clientY)
  }
  const samePointer = (event: Event): boolean => (event as PointerEvent).pointerId === press.pointerId
  const listeners: [string, EventListener, AddEventListenerOptions?][] = [
    ['pointermove', onMove],
    ['pointerup', (event) => { if (samePointer(event)) end(true) }],
    ['pointercancel', (event) => { if (samePointer(event)) end(false) }],
    ['keydown', (event) => { if ((event as KeyboardEvent).key === 'Escape') end(false) }],
    ['blur', () => end(false)],
    // Sem isto o navegador rola a lista e cancela o ponteiro no meio do arrasto.
    ['touchmove', whileActive, { passive: false }],
    ['contextmenu', whileActive]
  ]
  listeners.forEach(([type, listener, options]) => env.events.addEventListener(type, listener, options))
  if (touch) hold = setTimeout(activate, HOLD_MS)
  return () => end(false)
}

/** Categoria recolhida abre quando o canal fica um instante em cima dela. */
export function createPeekTimer(onPeek: (id: string) => void): { hover: (id: string | null) => void } {
  let current: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    hover: (id) => {
      if (id === current) return
      current = id
      if (timer !== null) clearTimeout(timer)
      timer = id === null ? null : setTimeout(() => onPeek(id), PEEK_MS)
    }
  }
}
