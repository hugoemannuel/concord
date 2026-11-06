import { describe, expect, it, vi } from 'vitest'

const stores = vi.hoisted(() => ({
  keybinds: { a1: 'F2', b1: 'Alt+1', c1: 'F4' } as Record<string, string>,
  server: [{ id: 'a1' }],
  favorites: [{ id: 'b1' }]
}))
vi.mock('../store/callStore', () => ({ useCallStore: vi.fn() }))
vi.mock('../store/soundboardStore', () => ({
  useSoundboardStore: {
    getState: () => ({ keybinds: stores.keybinds, soundsByServer: { 'srv-c': [{ id: 'c1' }], 'srv-a': stores.server } })
  }
}))
vi.mock('../store/soundFavoritesStore', () => ({
  useSoundFavoritesStore: { getState: () => ({ favorites: stores.favorites }) }
}))

import { channelCallServer, formatKeyboardShortcut, soundForKeyEvent } from './useSoundboardHotkeys'

class FakeElement {
  constructor(
    public tagName = 'DIV',
    public isContentEditable = false
  ) {}
}
vi.stubGlobal('HTMLElement', FakeElement)

const key = (k: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({
    key: k,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    target: null,
    ...extra
  }) as KeyboardEvent

describe('atalhos da mesa de áudio', () => {
  it('só há mesa em chamada ativa de canal', () => {
    expect(channelCallServer('active', 'channel', 'srv-a')).toBe('srv-a')
    expect(channelCallServer('active', 'dm', 'srv-a')).toBeNull()
    expect(channelCallServer('ringing', 'channel', 'srv-a')).toBeNull()
  })

  it('formata o atalho; letra solta não vale', () => {
    expect(formatKeyboardShortcut(key('1', { altKey: true }))).toBe('Alt+1')
    expect(formatKeyboardShortcut(key('F2'))).toBe('F2')
    expect(formatKeyboardShortcut(key('a'))).toBeNull()
    expect(formatKeyboardShortcut(key('Control', { ctrlKey: true }))).toBeNull()
  })

  it('acha som do servidor e favorito de outro servidor', () => {
    expect(soundForKeyEvent(key('F2'), 'srv-a')?.id).toBe('a1')
    expect(soundForKeyEvent(key('1', { altKey: true }), 'srv-a')?.id).toBe('b1')
  })

  it('acha também o som de outro servidor da pessoa (não só favorito)', () => {
    expect(soundForKeyEvent(key('F4'), 'srv-a')?.id).toBe('c1')
  })

  it('ignora repetição, campo de texto e tecla sem atalho', () => {
    expect(soundForKeyEvent(key('F2', { repeat: true }), 'srv-a')).toBeUndefined()
    const input = new FakeElement('INPUT') as unknown as EventTarget
    expect(soundForKeyEvent(key('F2', { target: input }), 'srv-a')).toBeUndefined()
    expect(soundForKeyEvent(key('a'), 'srv-a')).toBeUndefined()
  })
})
