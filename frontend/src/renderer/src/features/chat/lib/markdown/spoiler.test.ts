import { describe, expect, it } from 'vitest'
import { isRevealKey } from './spoiler'

describe('isRevealKey', () => {
  it('Enter e Espaço revelam; o resto não', () => {
    expect(isRevealKey('Enter')).toBe(true)
    expect(isRevealKey(' ')).toBe(true)
    expect(isRevealKey('Tab')).toBe(false)
    expect(isRevealKey('a')).toBe(false)
  })
})
