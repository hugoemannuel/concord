import { describe, expect, it } from 'vitest'
import {
  optionId,
  stepHighlight,
  suggestionFieldProps,
  suggestionKeyAction,
  type SuggestionKey
} from './suggestionNav'

type Mods = Partial<Omit<SuggestionKey, 'key'>>

const key = (k: string, mods: Mods = {}): SuggestionKey => ({
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods
})

describe('suggestionKeyAction', () => {
  it('setas andam pela lista, com ou sem destaque', () => {
    expect(suggestionKeyAction(key('ArrowDown'), false)).toBe('step')
    expect(suggestionKeyAction(key('ArrowUp'), true)).toBe('step')
  })

  it('setas com Alt/Ctrl/Meta são atalhos de navegação: seguem para o campo', () => {
    expect(suggestionKeyAction(key('ArrowUp', { altKey: true }), true)).toBeNull()
    expect(suggestionKeyAction(key('ArrowDown', { ctrlKey: true }), true)).toBeNull()
    expect(suggestionKeyAction(key('ArrowDown', { metaKey: true }), true)).toBeNull()
  })

  it('Enter e Tab escolhem o item destacado; sem destaque, seguem para o campo', () => {
    expect(suggestionKeyAction(key('Enter'), true)).toBe('pick')
    expect(suggestionKeyAction(key('Tab'), true)).toBe('pick')
    expect(suggestionKeyAction(key('Enter'), false)).toBeNull()
    expect(suggestionKeyAction(key('Tab'), false)).toBeNull()
  })

  it('Esc fecha a lista', () => {
    expect(suggestionKeyAction(key('Escape'), false)).toBe('close')
    expect(suggestionKeyAction(key('Escape'), true)).toBe('close')
  })

  it('o resto (letras, Home, End) é do campo', () => {
    expect(suggestionKeyAction(key('a'), true)).toBeNull()
    expect(suggestionKeyAction(key('Home'), true)).toBeNull()
    expect(suggestionKeyAction(key('End'), true)).toBeNull()
  })
})

describe('stepHighlight', () => {
  it('anda e dá a volta nas pontas', () => {
    expect(stepHighlight(0, 1, 3)).toBe(1)
    expect(stepHighlight(2, 1, 3)).toBe(0)
    expect(stepHighlight(0, -1, 3)).toBe(2)
  })

  it('sem destaque, ↓ vai ao primeiro e ↑ ao último', () => {
    expect(stepHighlight(-1, 1, 3)).toBe(0)
    expect(stepHighlight(-1, -1, 3)).toBe(2)
  })

  it('lista vazia: continua sem destaque', () => {
    expect(stepHighlight(-1, 1, 0)).toBe(-1)
  })
})

describe('suggestionFieldProps', () => {
  it('lista aberta com destaque: o campo aponta a lista e o item ativo', () => {
    expect(suggestionFieldProps({ listId: 'cmd', count: 3, highlight: 1 })).toEqual({
      'aria-autocomplete': 'list',
      'aria-controls': 'cmd',
      'aria-activedescendant': optionId('cmd', 1)
    })
  })

  it('lista aberta sem destaque: aponta só a lista', () => {
    expect(suggestionFieldProps({ listId: 'cmd', count: 3, highlight: -1 })).toEqual({
      'aria-autocomplete': 'list',
      'aria-controls': 'cmd'
    })
  })

  it('lista fechada: não aponta nada (nem um destaque que sobrou)', () => {
    expect(suggestionFieldProps({ listId: 'cmd', count: 0, highlight: 2 })).toEqual({
      'aria-autocomplete': 'list'
    })
  })
})
