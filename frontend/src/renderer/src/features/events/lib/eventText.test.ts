import { describe, expect, it } from 'vitest'
import { goingText } from './eventText'

describe('goingText', () => {
  it('ninguém', () => {
    expect(goingText(0)).toBe('Ninguém confirmou ainda')
  })

  it('uma pessoa vai (singular)', () => {
    expect(goingText(1)).toBe('1 vai')
  })

  it('várias pessoas vão (plural)', () => {
    expect(goingText(3)).toBe('3 vão')
  })
})
