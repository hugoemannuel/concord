import { describe, expect, it, vi } from 'vitest'
import { attachDismiss, focusOnEscape } from './dismiss'

/** Um alvo de eventos no lugar do `document` (os testes não têm DOM). */
function fakeDoc(): EventTarget {
  return new EventTarget()
}

const key = (k: string): Event => Object.assign(new Event('keydown'), { key: k })

describe('attachDismiss', () => {
  it('Esc no document fecha com o motivo "escape"', () => {
    const doc = fakeDoc()
    const onClose = vi.fn()
    attachDismiss(doc, () => false, onClose)
    doc.dispatchEvent(key('Escape'))
    expect(onClose).toHaveBeenCalledWith('escape')
  })

  it('outra tecla não fecha', () => {
    const doc = fakeDoc()
    const onClose = vi.fn()
    attachDismiss(doc, () => false, onClose)
    doc.dispatchEvent(key('Enter'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clique fora fecha com o motivo "outside"; clique dentro não', () => {
    const doc = fakeDoc()
    const onClose = vi.fn()
    let inside = true
    attachDismiss(doc, () => inside, onClose)
    doc.dispatchEvent(new Event('mousedown'))
    expect(onClose).not.toHaveBeenCalled()
    inside = false
    doc.dispatchEvent(new Event('mousedown'))
    expect(onClose).toHaveBeenCalledWith('outside')
  })

  it('a limpeza tira os ouvintes', () => {
    const doc = fakeDoc()
    const onClose = vi.fn()
    attachDismiss(doc, () => false, onClose)()
    doc.dispatchEvent(key('Escape'))
    doc.dispatchEvent(new Event('mousedown'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('focusOnEscape', () => {
  it('Esc fecha e devolve o foco', () => {
    const close = vi.fn()
    const focus = vi.fn()
    focusOnEscape(close, focus)('escape')
    expect(close).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('clique fora fecha sem roubar o foco', () => {
    const close = vi.fn()
    const focus = vi.fn()
    focusOnEscape(close, focus)('outside')
    expect(close).toHaveBeenCalledTimes(1)
    expect(focus).not.toHaveBeenCalled()
  })
})
