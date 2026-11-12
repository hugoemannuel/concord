import { describe, expect, it } from 'vitest'
import { checkedOptionIndex, keyTarget, optionTabIndex } from './menuFocus'

describe('foco do menu de prazo', () => {
  it('a opção marcada recebe o foco ao abrir', () => {
    expect(checkedOptionIndex(null)).toBe(0)
    expect(checkedOptionIndex(86400)).toBe(1)
    expect(checkedOptionIndex(604800)).toBe(2)
    expect(checkedOptionIndex(7776000)).toBe(3)
  })

  it('roving tabindex: só a marcada entra no Tab', () => {
    expect([0, 1, 2, 3].map((i) => optionTabIndex(i, 2))).toEqual([-1, -1, 0, -1])
  })

  it('setas, Home e End escolhem a opção que recebe o foco', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(keyTarget(items, 'b', 'ArrowDown')).toBe('c')
    expect(keyTarget(items, 'd', 'ArrowDown')).toBe('a')
    expect(keyTarget(items, 'a', 'ArrowUp')).toBe('d')
    expect(keyTarget(items, 'c', 'Home')).toBe('a')
    expect(keyTarget(items, 'a', 'End')).toBe('d')
    expect(keyTarget(items, 'b', 'Tab')).toBeNull()
    expect(keyTarget(items, null, 'ArrowDown')).toBe('a')
    expect(keyTarget([], null, 'ArrowDown')).toBeNull()
  })
})
