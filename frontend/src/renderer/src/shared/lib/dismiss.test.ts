import { describe, expect, it, vi } from 'vitest'
import { attachDismiss, focusOnEscape, insideAny } from './dismiss'

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
    expect(onClose).toHaveBeenCalledWith('escape', expect.any(Event))
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
    expect(onClose).toHaveBeenCalledWith('outside', expect.any(Event))
  })

  it('a limpeza tira os ouvintes', () => {
    const doc = fakeDoc()
    const onClose = vi.fn()
    attachDismiss(doc, () => false, onClose)()
    doc.dispatchEvent(key('Escape'))
    doc.dispatchEvent(new Event('mousedown'))
    expect(onClose).not.toHaveBeenCalled()
  })
  it('o motivo vem com o evento (quem fecha pode impedir o padrão do Esc)', () => {
    const doc = fakeDoc()
    const onClose = vi.fn()
    attachDismiss(doc, () => false, onClose)
    const esc = key('Escape')
    doc.dispatchEvent(esc)
    expect(onClose).toHaveBeenCalledWith('escape', esc)
  })

  it('com event "pointerdown" o clique fora vem do pointerdown, não do mousedown', () => {
    const doc = fakeDoc()
    const onClose = vi.fn()
    attachDismiss(doc, () => false, onClose, { event: 'pointerdown' })
    doc.dispatchEvent(new Event('mousedown'))
    expect(onClose).not.toHaveBeenCalled()
    doc.dispatchEvent(new Event('pointerdown'))
    expect(onClose).toHaveBeenCalledWith('outside', expect.any(Event))
  })

  it('com escape false o Esc fica com o componente; o clique fora ainda fecha', () => {
    const doc = fakeDoc()
    const onClose = vi.fn()
    attachDismiss(doc, () => false, onClose, { escape: false })
    doc.dispatchEvent(key('Escape'))
    expect(onClose).not.toHaveBeenCalled()
    doc.dispatchEvent(new Event('mousedown'))
    expect(onClose).toHaveBeenCalledWith('outside', expect.any(Event))
  })
})

describe('insideAny', () => {
  const box = (...kids: unknown[]): Node => ({ contains: (n: unknown) => kids.includes(n) }) as unknown as Node

  it('dentro do painel ou do botão que abriu conta como dentro', () => {
    const target = {} as Node
    expect(insideAny([box(target), null], target)).toBe(true)
    expect(insideAny([null, box(), box(target)], target)).toBe(true)
  })

  it('fora de todos (ou sem elemento montado) é fora', () => {
    expect(insideAny([box(), undefined, null], {} as Node)).toBe(false)
    expect(insideAny([], {} as Node)).toBe(false)
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
