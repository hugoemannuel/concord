import { describe, expect, it, vi } from 'vitest'
import { routeTileClick, routeTileDoubleClick } from './tileClicks'

const clicks = () => ({ click: vi.fn(), cancel: vi.fn() })
const target = (interactive: boolean): Element =>
  ({ closest: () => (interactive ? {} : null) }) as unknown as Element

describe('routeTileClick', () => {
  it('sem ação ou em tela cheia não faz nada', () => {
    const c = clicks()
    const fn = vi.fn()
    routeTileClick(c, undefined, false, true)
    routeTileClick(c, fn, true, true)
    expect(c.click).not.toHaveBeenCalled()
    expect(fn).not.toHaveBeenCalled()
  })

  it('com tela cheia possível espera a janela do duplo clique', () => {
    const c = clicks()
    const fn = vi.fn()
    routeTileClick(c, fn, false, true)
    expect(c.click).toHaveBeenCalledWith(fn)
    expect(fn).not.toHaveBeenCalled()
  })

  it('sem tela cheia chama direto', () => {
    const c = clicks()
    const fn = vi.fn()
    routeTileClick(c, fn, false, false)
    expect(fn).toHaveBeenCalled()
    expect(c.click).not.toHaveBeenCalled()
  })
})

describe('routeTileDoubleClick', () => {
  it('alterna a tela cheia e cancela o clique pendente', () => {
    const c = clicks()
    const toggle = vi.fn()
    routeTileDoubleClick(c, true, target(false), toggle)
    expect(c.cancel).toHaveBeenCalled()
    expect(toggle).toHaveBeenCalled()
  })

  it('ignora sem tela cheia e em controles', () => {
    const c = clicks()
    const toggle = vi.fn()
    routeTileDoubleClick(c, false, target(false), toggle)
    routeTileDoubleClick(c, true, target(true), toggle)
    expect(toggle).not.toHaveBeenCalled()
    expect(c.cancel).not.toHaveBeenCalled()
  })
})
