import { describe, expect, it } from 'vitest'
import { nextTabIndex } from './tabKeys'

describe('nextTabIndex', () => {
  it('setas andam e dão a volta; Home e End vão às pontas', () => {
    expect(nextTabIndex(0, 'ArrowRight', 4)).toBe(1)
    expect(nextTabIndex(3, 'ArrowRight', 4)).toBe(0)
    expect(nextTabIndex(0, 'ArrowLeft', 4)).toBe(3)
    expect(nextTabIndex(2, 'ArrowLeft', 4)).toBe(1)
    expect(nextTabIndex(2, 'Home', 4)).toBe(0)
    expect(nextTabIndex(1, 'End', 4)).toBe(3)
  })
  it('outras teclas não mexem', () => {
    expect(nextTabIndex(1, 'Enter', 4)).toBeNull()
    expect(nextTabIndex(1, 'ArrowDown', 4)).toBeNull()
  })
})
