import { describe, expect, it } from 'vitest'
import {
  composerKeyAction,
  nextHighlight,
  type ComposerKey,
  type ComposerKeyContext
} from './composerKeys'

type Mods = Partial<Omit<ComposerKey, 'key'>>

const key = (k: string, mods: Mods = {}): ComposerKey => ({
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods
})

const IDLE: ComposerKeyContext = {
  suggesting: false,
  highlighted: false,
  draftEmpty: false,
  replying: false,
  composing: false,
  touch: false
}
const MENU: ComposerKeyContext = { ...IDLE, suggesting: true }

describe('composerKeyAction', () => {
  it('com o menu de @ aberto, setas navegam (sem Alt/Ctrl/Meta)', () => {
    expect(composerKeyAction(key('ArrowDown'), MENU)).toBe('mention-step')
    expect(composerKeyAction(key('ArrowUp'), MENU)).toBe('mention-step')
    expect(composerKeyAction(key('ArrowUp', { altKey: true }), MENU)).toBe('none')
    expect(composerKeyAction(key('ArrowDown', { ctrlKey: true }), MENU)).toBe('none')
  })

  it('Enter/Tab pegam o item destacado; sem destaque, Enter envia e Tab segue normal', () => {
    const highlighted = { ...MENU, highlighted: true }
    expect(composerKeyAction(key('Enter'), highlighted)).toBe('mention-pick')
    expect(composerKeyAction(key('Tab'), highlighted)).toBe('mention-pick')
    expect(composerKeyAction(key('Enter'), MENU)).toBe('send')
    expect(composerKeyAction(key('Tab'), MENU)).toBe('none')
    expect(composerKeyAction(key('Tab'), { ...MENU, replying: true })).toBe('none')
  })

  it('Esc fecha o menu antes de cancelar a resposta', () => {
    expect(composerKeyAction(key('Escape'), { ...MENU, replying: true })).toBe('mention-close')
    expect(composerKeyAction(key('Escape'), { ...IDLE, replying: true })).toBe('cancel-reply')
    expect(composerKeyAction(key('Escape'), IDLE)).toBe('none')
  })

  it('↑ no campo vazio e sem modificador edita a última mensagem', () => {
    const empty = { ...IDLE, draftEmpty: true }
    expect(composerKeyAction(key('ArrowUp'), empty)).toBe('edit-last')
    expect(composerKeyAction(key('ArrowUp', { shiftKey: true }), empty)).toBe('none')
    expect(composerKeyAction(key('ArrowUp', { metaKey: true }), empty)).toBe('none')
    expect(composerKeyAction(key('ArrowUp'), IDLE)).toBe('none')
    expect(composerKeyAction(key('ArrowDown'), empty)).toBe('none')
  })
})

describe('composerKeyAction: várias linhas', () => {
  it('Enter envia; Shift+Enter quebra a linha (como no Discord)', () => {
    expect(composerKeyAction(key('Enter'), IDLE)).toBe('send')
    expect(composerKeyAction(key('Enter', { shiftKey: true }), IDLE)).toBe('none')
  })

  it('Enter no meio da composição do teclado (IME, acentos) não envia', () => {
    expect(composerKeyAction(key('Enter'), { ...IDLE, composing: true })).toBe('none')
  })

  it('no toque Enter quebra a linha: quem envia é o botão', () => {
    expect(composerKeyAction(key('Enter'), { ...IDLE, touch: true })).toBe('none')
    expect(composerKeyAction(key('Enter'), { ...MENU, highlighted: true, touch: true })).toBe('mention-pick')
  })
})

describe('nextHighlight', () => {
  it('sem destaque, ↓ vai para o primeiro e ↑ para o último', () => {
    expect(nextHighlight(-1, 1, 4)).toBe(0)
    expect(nextHighlight(-1, -1, 4)).toBe(3)
  })

  it('dá a volta nas pontas', () => {
    expect(nextHighlight(3, 1, 4)).toBe(0)
    expect(nextHighlight(0, -1, 4)).toBe(3)
    expect(nextHighlight(1, 1, 4)).toBe(2)
  })
})
