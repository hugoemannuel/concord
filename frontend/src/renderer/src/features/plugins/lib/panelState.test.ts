import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOAD_TIMEOUT_MS, panelReducer, startLoadTimer } from './panelState'
import { attachDismiss } from './dismiss'

describe('panelReducer', () => {
  it('carregou e falhou', () => {
    const s0 = { attempt: 0, status: 'loading' as const }
    expect(panelReducer(s0, 'loaded').status).toBe('loaded')
    expect(panelReducer(s0, 'timeout').status).toBe('failed')
  })

  it('o timeout não derruba um painel que já carregou', () => {
    expect(panelReducer({ attempt: 0, status: 'loaded' }, 'timeout').status).toBe('loaded')
  })

  it('tentar de novo volta a carregar e incrementa a key', () => {
    expect(panelReducer({ attempt: 0, status: 'failed' }, 'retry')).toEqual({
      attempt: 1,
      status: 'loading'
    })
  })
})

describe('startLoadTimer', () => {
  afterEach(() => vi.useRealTimers())

  it('dispara só depois de 10000 ms', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    startLoadTimer(cb)
    vi.advanceTimersByTime(LOAD_TIMEOUT_MS - 1)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('cancelar impede o disparo', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    startLoadTimer(cb)()
    vi.advanceTimersByTime(LOAD_TIMEOUT_MS)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('attachDismiss', () => {
  function click(target: unknown): Event {
    return Object.defineProperty(new Event('mousedown'), 'target', { value: target })
  }

  function key(target: EventTarget, k: string): void {
    target.dispatchEvent(Object.assign(new Event('keydown'), { key: k }))
  }

  it('Esc chama onClose; outras teclas não', () => {
    const doc = new EventTarget()
    const onClose = vi.fn()
    attachDismiss(doc, () => false, onClose)
    key(doc, 'a')
    expect(onClose).not.toHaveBeenCalled()
    key(doc, 'Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clique fora fecha; clique dentro não; o cleanup desliga', () => {
    const doc = new EventTarget()
    const onClose = vi.fn()
    const inside = {} as Node
    const off = attachDismiss(doc, (n) => n === inside, onClose)
    doc.dispatchEvent(click(inside))
    expect(onClose).not.toHaveBeenCalled()
    doc.dispatchEvent(click({}))
    expect(onClose).toHaveBeenCalledTimes(1)
    off()
    key(doc, 'Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
