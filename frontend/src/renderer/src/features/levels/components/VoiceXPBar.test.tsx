import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const state = vi.hoisted(() => ({
  me: null as null | {
    level: number
    xp_into_level: number
    xp_for_next: number
    voice_seconds: number
  },
  boost: 100
}))
vi.mock('../store/levelStore', () => ({
  useLevelStore: <T,>(pick: (s: { me: typeof state.me }) => T): T => pick({ me: state.me })
}))
vi.mock('../hooks/useMyBoost', () => ({ useMyBoostPercent: () => state.boost }))

import VoiceXPBar from './VoiceXPBar'

const render = (paused = false): string => renderToStaticMarkup(<VoiceXPBar paused={paused} />)
const count = (html: string, needle: string): number => html.split(needle).length - 1

describe('VoiceXPBar', () => {
  beforeEach(() => {
    state.me = { level: 12, xp_into_level: 40, xp_for_next: 100, voice_seconds: 3600 }
    state.boost = 100
  })

  it('sem dados do usuário, não desenha nada', () => {
    state.me = null
    expect(render()).toBe('')
  })

  it('sem buff: nível e XP, sem rank, brilho nem brasas', () => {
    const html = render()
    expect(html).toContain('Nível 12')
    expect(html).toContain('40/100 XP')
    expect(html).not.toContain('boost-letter')
    expect(html).not.toContain('boost-shine')
    expect(html).not.toContain('boost-ember')
  })

  it.each([
    [125, 'Dope!', 'x1.25'],
    [150, 'Crazy!', 'x1.5'],
    [175, 'Blast!', 'x1.75'],
    [200, 'Alright!', 'x2.0']
  ])('%i%%: rank com brilho e sem brasas', (percent, text, label) => {
    state.boost = percent
    const html = render()
    expect(html).toContain(text)
    expect(html).toContain(label)
    expect(count(html, 'class="boost-shine ')).toBe(1)
    expect(count(html, 'boost-ember ')).toBe(0)
  })

  it('SS solta 4 brasas e SSS solta 7', () => {
    state.boost = 300
    expect(count(render(), 'boost-ember ')).toBe(4)
    state.boost = 400
    expect(count(render(), 'boost-ember ')).toBe(7)
  })

  it('o brilho acompanha o rank', () => {
    state.boost = 125
    expect(render()).toContain('--boost-shine-ms:3200ms')
    state.boost = 400
    expect(render()).toContain('--boost-shine-ms:800ms')
  })

  it('pausado: texto de pausa, rank apagado, sem brilho nem brasas', () => {
    state.boost = 400
    const html = render(true)
    expect(html).toContain('XP pausado (mutado)')
    expect(html).toContain('data-paused="true"')
    expect(html).not.toContain('boost-shine')
    expect(html).not.toContain('boost-ember')
  })
})
