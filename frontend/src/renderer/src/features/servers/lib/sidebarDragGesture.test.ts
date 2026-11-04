import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOLD_MS, createPeekTimer, startDragGesture, type GestureEnv } from './sidebarDragGesture'

function pointer(type: string, init: Record<string, unknown> = {}): Event {
  const event = new Event(type, { cancelable: true })
  return Object.assign(event, { pointerId: 1, clientX: 0, clientY: 0, ...init })
}

function setup(pointerType = 'mouse'): {
  events: EventTarget
  env: GestureEnv
  cancel: () => void
  frames: (() => void)[]
} {
  const events = new EventTarget()
  const frames: (() => void)[] = []
  const env: GestureEnv = {
    events,
    requestFrame: (cb) => frames.push(cb),
    cancelFrame: vi.fn(),
    activate: vi.fn(),
    move: vi.fn(),
    autoScroll: vi.fn(() => false),
    finish: vi.fn()
  }
  const cancel = startDragGesture(env, { pointerId: 1, pointerType, x: 100, y: 100 })
  return { events, env, cancel, frames }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('gesto com mouse', () => {
  it('só começa depois de andar um pouco', () => {
    const { events, env } = setup()
    events.dispatchEvent(pointer('pointermove', { clientX: 102, clientY: 101 }))
    expect(env.activate).not.toHaveBeenCalled()
    events.dispatchEvent(pointer('pointermove', { clientX: 110, clientY: 100 }))
    expect(env.activate).toHaveBeenCalledTimes(1)
    expect(env.move).toHaveBeenLastCalledWith(110, 100)
  })
  it('clique sem andar não arrasta nem é engolido', () => {
    const { events, env } = setup()
    events.dispatchEvent(pointer('pointerup'))
    expect(env.finish).not.toHaveBeenCalled()
    const click = new Event('click', { cancelable: true })
    events.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })
  it('soltar conclui e engole o clique que vem junto, só ele', () => {
    const { events, env } = setup()
    events.dispatchEvent(pointer('pointermove', { clientX: 120, clientY: 100 }))
    events.dispatchEvent(pointer('pointerup'))
    expect(env.finish).toHaveBeenCalledWith(true)
    const click = new Event('click', { cancelable: true })
    events.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    vi.runAllTimers()
    const later = new Event('click', { cancelable: true })
    events.dispatchEvent(later)
    expect(later.defaultPrevented).toBe(false)
  })
  it('Esc cancela sem soltar', () => {
    const { events, env } = setup()
    events.dispatchEvent(pointer('pointermove', { clientX: 120, clientY: 100 }))
    events.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter' }))
    expect(env.finish).not.toHaveBeenCalled()
    events.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }))
    expect(env.finish).toHaveBeenCalledWith(false)
  })
  it('ignora outro ponteiro e para de ouvir ao terminar', () => {
    const { events, env } = setup()
    events.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 300, clientY: 300 }))
    expect(env.activate).not.toHaveBeenCalled()
    events.dispatchEvent(pointer('pointermove', { clientX: 120, clientY: 100 }))
    events.dispatchEvent(pointer('pointercancel'))
    expect(env.finish).toHaveBeenCalledWith(false)
    events.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 100 }))
    expect(env.move).toHaveBeenCalledTimes(1)
  })
  it('perder a janela cancela', () => {
    const { events, env } = setup()
    events.dispatchEvent(pointer('pointermove', { clientX: 120, clientY: 100 }))
    events.dispatchEvent(new Event('blur'))
    expect(env.finish).toHaveBeenCalledWith(false)
  })
  it('a rolagem automática reavalia o alvo quando a lista andou', () => {
    const { events, env, frames } = setup()
    events.dispatchEvent(pointer('pointermove', { clientX: 120, clientY: 100 }))
    vi.mocked(env.autoScroll).mockReturnValue(true)
    frames.pop()?.()
    expect(env.autoScroll).toHaveBeenCalledWith(100)
    expect(env.move).toHaveBeenCalledTimes(2)
    vi.mocked(env.autoScroll).mockReturnValue(false)
    frames.pop()?.()
    expect(env.move).toHaveBeenCalledTimes(2)
  })
  it('cancelar de fora termina o arrasto', () => {
    const { events, env, cancel } = setup()
    events.dispatchEvent(pointer('pointermove', { clientX: 120, clientY: 100 }))
    cancel()
    expect(env.finish).toHaveBeenCalledWith(false)
    expect(env.cancelFrame).toHaveBeenCalled()
  })
  it('cancelar antes de começar não avisa ninguém', () => {
    const { env, cancel } = setup()
    cancel()
    expect(env.finish).not.toHaveBeenCalled()
  })
})

describe('gesto com toque', () => {
  it('segurar parado começa o arrasto; antes disso a rolagem é livre', () => {
    const { events, env } = setup('touch')
    const free = new Event('touchmove', { cancelable: true })
    events.dispatchEvent(free)
    expect(free.defaultPrevented).toBe(false)
    vi.advanceTimersByTime(HOLD_MS)
    expect(env.activate).toHaveBeenCalledTimes(1)
    const held = new Event('touchmove', { cancelable: true })
    events.dispatchEvent(held)
    expect(held.defaultPrevented).toBe(true)
  })
  it('mexer o dedo antes da hora é rolagem: nunca arrasta', () => {
    const { events, env } = setup('touch')
    events.dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 130 }))
    vi.advanceTimersByTime(HOLD_MS * 2)
    expect(env.activate).not.toHaveBeenCalled()
  })
  it('um tremidinho do dedo não cancela', () => {
    const { events, env } = setup('touch')
    events.dispatchEvent(pointer('pointermove', { clientX: 103, clientY: 104 }))
    vi.advanceTimersByTime(HOLD_MS)
    expect(env.activate).toHaveBeenCalledTimes(1)
  })
  it('o navegador assumir a rolagem cancela a espera', () => {
    const { events, env } = setup('touch')
    events.dispatchEvent(pointer('pointercancel'))
    vi.advanceTimersByTime(HOLD_MS)
    expect(env.activate).not.toHaveBeenCalled()
    expect(env.finish).not.toHaveBeenCalled()
  })
  it('o menu do toque longo não abre durante o arrasto', () => {
    const { events } = setup('touch')
    vi.advanceTimersByTime(HOLD_MS)
    const menu = new Event('contextmenu', { cancelable: true })
    events.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
  })
})

describe('abrir categoria recolhida', () => {
  it('abre depois de um instante em cima', () => {
    const onPeek = vi.fn()
    const peek = createPeekTimer(onPeek)
    peek.hover('a')
    peek.hover('a')
    vi.advanceTimersByTime(299)
    expect(onPeek).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(onPeek).toHaveBeenCalledTimes(1)
    expect(onPeek).toHaveBeenCalledWith('a')
  })
  it('sair de cima cancela', () => {
    const onPeek = vi.fn()
    const peek = createPeekTimer(onPeek)
    peek.hover('a')
    peek.hover(null)
    vi.runAllTimers()
    expect(onPeek).not.toHaveBeenCalled()
  })
  it('trocar de categoria recomeça a espera', () => {
    const onPeek = vi.fn()
    const peek = createPeekTimer(onPeek)
    peek.hover('a')
    peek.hover('b')
    vi.runAllTimers()
    expect(onPeek.mock.calls).toEqual([['b']])
  })
})
