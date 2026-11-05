import { describe, expect, it, vi } from 'vitest'
import {
  applyBottomScroll,
  distanceFromBottom,
  isNearBottom,
  resizeTargets,
  SETTLE_MS,
  shouldFollowGrowth,
  type ScrollMetrics
} from './stickToBottom'

const view = (scrollTop: number, clientHeight = 500, scrollHeight = 5000): ScrollMetrics => ({
  scrollTop,
  clientHeight,
  scrollHeight
})
/** Métricas a `distance` px do fim. */
const away = (distance: number, clientHeight = 500, scrollHeight = 5000): ScrollMetrics =>
  view(scrollHeight - clientHeight - distance, clientHeight, scrollHeight)

describe('distanceFromBottom / isNearBottom', () => {
  it('distância é o que falta rolar até o fim', () => {
    expect(distanceFromBottom(away(120))).toBe(120)
    expect(distanceFromBottom(away(0))).toBe(0)
  })

  it('perto do fim: menos de 60 px (igual ao grude do auto-scroll)', () => {
    expect(isNearBottom(away(0))).toBe(true)
    expect(isNearBottom(away(59))).toBe(true)
    expect(isNearBottom(away(60))).toBe(false)
  })

  it('o px é ajustável', () => {
    expect(isNearBottom(away(100), 150)).toBe(true)
  })
})

describe('applyBottomScroll', () => {
  const scroller = (): { scrollTop: number; scrollHeight: number; scrollTo: ReturnType<typeof vi.fn> } => ({
    scrollTop: 0,
    scrollHeight: 900,
    scrollTo: vi.fn()
  })

  it('instantâneo: vai ao fim de uma vez e devolve até quando acompanhar o conteúdo', () => {
    const el = scroller()
    expect(applyBottomScroll('instant', el, 1000)).toBe(1000 + SETTLE_MS)
    expect(el.scrollTop).toBe(900)
    expect(el.scrollTo).not.toHaveBeenCalled()
  })

  it('instantâneo sem a lista desenhada: só devolve o prazo', () => {
    expect(applyBottomScroll('instant', null, 1000)).toBe(1000 + SETTLE_MS)
  })

  // #555: scrollIntoView na marca do fim rolava também os pais com overflow
  // hidden (#root, main) quando a janela é baixa, e o app inteiro subia.
  it('suave: rola só a lista até o fim, sem mexer nos pais', () => {
    const el = scroller()
    expect(applyBottomScroll('smooth', el, 1000)).toBeNull()
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 900, behavior: 'smooth' })
  })

  it('suave sem a lista desenhada: não faz nada', () => {
    expect(applyBottomScroll('smooth', null, 1000)).toBeNull()
  })

  it('nenhum: não mexe em nada', () => {
    const el = scroller()
    expect(applyBottomScroll('none', el, 1000)).toBeNull()
    expect(el.scrollTop).toBe(0)
    expect(el.scrollTo).not.toHaveBeenCalled()
  })
})

describe('shouldFollowGrowth', () => {
  it('acompanha só dentro do prazo e com a pessoa no fim', () => {
    expect(shouldFollowGrowth(1000, 2000, true)).toBe(true)
    expect(shouldFollowGrowth(2000, 2000, true)).toBe(false)
    expect(shouldFollowGrowth(1000, 2000, false)).toBe(false)
  })
})

describe('resizeTargets', () => {
  it('precisa do conteúdo, da lista e do ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', class {})
    expect(resizeTargets('lista', 'conteudo')).toEqual({ scroller: 'lista', content: 'conteudo' })
    expect(resizeTargets(null, 'conteudo')).toBeNull()
    expect(resizeTargets('lista', null)).toBeNull()
    vi.stubGlobal('ResizeObserver', undefined)
    expect(resizeTargets('lista', 'conteudo')).toBeNull()
    vi.unstubAllGlobals()
  })
})
