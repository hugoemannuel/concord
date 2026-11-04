import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ScreenCelebration } from '../hooks/useScreenCelebration'

let current: ScreenCelebration | null = null
vi.mock('../hooks/useScreenCelebration', () => ({ useScreenCelebration: () => current }))
vi.mock('../../call/store/callStore', () => ({
  useCallStore: { getState: () => ({ status: 'idle' }) }
}))

import LevelUpMilestone from './LevelUpMilestone'

const celebrate = (level: number, previous = level - 1): void => {
  current = { key: level, userId: 'eu', level, previous, own: true }
}

const screen = (reduce: boolean): void => {
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: reduce })
  })
}

describe('LevelUpMilestone', () => {
  beforeEach(() => screen(false))
  afterEach(() => {
    current = null
    vi.unstubAllGlobals()
  })

  it('sem celebração ou numa subida comum não mostra nada', () => {
    expect(renderToStaticMarkup(<LevelUpMilestone />)).toBe('')
    celebrate(23)
    expect(renderToStaticMarkup(<LevelUpMilestone />)).toBe('')
  })

  it('no 24 toca a cena do orgulho: canvas, número 24 brilhando e título padrão', () => {
    celebrate(24)
    const html = renderToStaticMarkup(<LevelUpMilestone />)
    expect(html).toContain('data-milestone="pride"')
    expect(html).toContain('<canvas')
    expect(html).toContain('level-number-shine')
    expect(html).toContain('>24</p>')
    expect(html).toContain('Nível 24')
    expect(html).toContain('#e40303')
  })

  it('no 13 toca a estrela vermelha e no 22 a bandeira, com o título padrão', () => {
    celebrate(13)
    let html = renderToStaticMarkup(<LevelUpMilestone />)
    expect(html).toContain('data-milestone="redstar"')
    expect(html).toContain('<canvas')
    expect(html).toContain('>13</p>')
    expect(html).toContain('Nível 13')
    celebrate(22)
    html = renderToStaticMarkup(<LevelUpMilestone />)
    expect(html).toContain('data-milestone="brazil"')
    expect(html).toContain('<canvas')
    expect(html).toContain('>22</p>')
    expect(html).toContain('Nível 22')
  })

  it('o marco lendário mantém coroa e "LENDÁRIO"', () => {
    celebrate(100)
    const html = renderToStaticMarkup(<LevelUpMilestone />)
    expect(html).toContain('data-milestone="legendary"')
    expect(html).toContain('LENDÁRIO')
    expect(html).toContain('Nível 100')
  })

  it('cena que desenha o próprio número deixa o título só guardando o lugar', () => {
    celebrate(50)
    expect(renderToStaticMarkup(<LevelUpMilestone />)).toContain('visibility:hidden')
  })

  it('com movimento reduzido: sem canvas, só o título aparecendo e sumindo', () => {
    screen(true)
    celebrate(24)
    const html = renderToStaticMarkup(<LevelUpMilestone />)
    expect(html).not.toContain('<canvas')
    expect(html).toContain('level-fade')
    expect(html).toContain('>24</p>')
  })
})
