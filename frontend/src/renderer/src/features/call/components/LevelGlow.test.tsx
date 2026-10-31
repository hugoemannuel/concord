import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// renderToStaticMarkup lê o estado inicial do zustand: troca o store por um simulado.
const state = vi.hoisted(() => ({
  celebrations: {} as Record<string, { level: number; previous: number; key: number }>
}))
vi.mock('../../levels/store/levelStore', () => ({
  useLevelStore: (select: (s: typeof state) => unknown) => select(state)
}))

import LevelGlow from './LevelGlow'

const celebrate = (level: number): void => {
  state.celebrations = { u1: { level, previous: level - 1, key: 1 } }
}

describe('LevelGlow', () => {
  beforeEach(() => {
    state.celebrations = {}
  })

  it('sem celebração não renderiza', () => {
    expect(renderToStaticMarkup(<LevelGlow userId="u1" isScreen={false} />)).toBe('')
  })

  it('nível sem brilho de tile não renderiza', () => {
    celebrate(5)
    expect(renderToStaticMarkup(<LevelGlow userId="u1" isScreen={false} />)).toBe('')
  })

  it('do nível 60 em diante o tile brilha', () => {
    celebrate(65)
    const html = renderToStaticMarkup(<LevelGlow userId="u1" isScreen={false} />)
    expect(html).toContain('level-tile-glow')
  })

  it('transmissão de tela nunca brilha', () => {
    celebrate(65)
    expect(renderToStaticMarkup(<LevelGlow userId="u1" isScreen />)).toBe('')
  })
})
