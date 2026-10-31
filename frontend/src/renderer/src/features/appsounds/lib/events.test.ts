import { describe, expect, it } from 'vitest'
import { isSoundEvent, SOUND_EVENT_GROUPS, SOUND_EVENTS } from './events'

describe('SOUND_EVENT_GROUPS', () => {
  it('mostra cada evento uma vez, todos eles', () => {
    const shown = SOUND_EVENT_GROUPS.flatMap((g) => g.events.map((e) => e.id))
    expect(shown.slice().sort()).toEqual(SOUND_EVENTS.slice().sort())
  })
})

describe('isSoundEvent', () => {
  it('aceita os sons trocáveis e recusa os de nível', () => {
    expect(isSoundEvent('mention')).toBe(true)
    expect(isSoundEvent('levelChime')).toBe(false)
  })
})
