import { describe, expect, it, vi } from 'vitest'

vi.mock('../store/callStore', () => ({ useCallStore: vi.fn() }))
vi.mock('../store/soundboardStore', () => ({ useSoundboardStore: vi.fn() }))
vi.mock('../store/soundFavoritesStore', () => ({ useSoundFavoritesStore: vi.fn() }))
const toast = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('../../../shared/store/toastStore', () => ({ showToast: toast }))

import { keybindAction, keybindKeyHandler } from './useKeybindRecording'

const key = (k: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...extra }) as KeyboardEvent

describe('gravar o atalho de um som', () => {
  it('Esc cancela; Backspace e Delete limpam', () => {
    expect(keybindAction(key('Escape'))).toEqual({ kind: 'cancel' })
    expect(keybindAction(key('Backspace'))).toEqual({ kind: 'clear' })
    expect(keybindAction(key('Delete'))).toEqual({ kind: 'clear' })
  })

  it('F1–F12 ou combinação com Alt/Ctrl viram o atalho; letra solta não', () => {
    expect(keybindAction(key('F3'))).toEqual({ kind: 'set', shortcut: 'F3' })
    expect(keybindAction(key('1', { altKey: true }))).toEqual({ kind: 'set', shortcut: 'Alt+1' })
    expect(keybindAction(key('a'))).toEqual({ kind: 'invalid' })
  })
})

describe('tecla durante a gravação', () => {
  const press = (k: string, extra: Partial<KeyboardEvent> = {}) => {
    const setKeybind = vi.fn()
    const stop = vi.fn()
    const e = { ...key(k, extra), preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent
    keybindKeyHandler('snd', setKeybind, stop)(e)
    return { setKeybind, stop, e }
  }

  it('grava o atalho e encerra, sem a tecla chegar ao resto do app', () => {
    const { setKeybind, stop, e } = press('F5')
    expect(setKeybind).toHaveBeenCalledWith('snd', 'F5')
    expect(stop).toHaveBeenCalled()
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
  })

  it('Backspace limpa; Esc só encerra', () => {
    expect(press('Backspace').setKeybind).toHaveBeenCalledWith('snd', null)
    const esc = press('Escape')
    expect(esc.setKeybind).not.toHaveBeenCalled()
    expect(esc.stop).toHaveBeenCalled()
  })

  it('tecla sem atalho avisa e continua gravando', () => {
    const { setKeybind, stop } = press('a')
    expect(toast.info).toHaveBeenCalled()
    expect(setKeybind).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
  })
})
