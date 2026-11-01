import { describe, expect, it } from 'vitest'
import { editorKeyAction, isEditableElement, keyActionForEvent, type FocusInfo, type KeyInfo } from './editorKeys'

const key = (k: string, mods: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  defaultPrevented: false,
  ...mods
})
const FREE: FocusInfo = { editable: false, inPanel: false, modalOpen: false }

describe('editorKeyAction', () => {
  it('Esc cancela; num campo fora do painel (caixa de mensagem) não', () => {
    expect(editorKeyAction(key('Escape'), FREE)).toBe('cancel')
    expect(editorKeyAction(key('Escape'), { ...FREE, editable: true, inPanel: true })).toBe('cancel')
    expect(editorKeyAction(key('Escape'), { ...FREE, editable: true })).toBeNull()
  })

  it('modal por cima ou tecla já tratada: nada', () => {
    expect(editorKeyAction(key('Escape'), { ...FREE, modalOpen: true })).toBeNull()
    expect(editorKeyAction(key('Escape', { defaultPrevented: true }), FREE)).toBeNull()
  })

  it('desfazer e refazer, menos dentro de campo de texto', () => {
    expect(editorKeyAction(key('z', { ctrlKey: true }), FREE)).toBe('undo')
    expect(editorKeyAction(key('Z', { metaKey: true, shiftKey: true }), FREE)).toBe('redo')
    expect(editorKeyAction(key('y', { ctrlKey: true }), FREE)).toBe('redo')
    expect(editorKeyAction(key('z', { ctrlKey: true }), { ...FREE, editable: true, inPanel: true })).toBeNull()
    expect(editorKeyAction(key('z'), FREE)).toBeNull()
    expect(editorKeyAction(key('x', { ctrlKey: true }), FREE)).toBeNull()
  })
})

describe('isEditableElement', () => {
  it('campo de texto, área de texto e editável; botão e seletor de cor não', () => {
    expect(isEditableElement({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isEditableElement({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableElement({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isEditableElement({ tagName: 'INPUT', type: 'color' })).toBe(false)
    expect(isEditableElement({ tagName: 'INPUT', type: 'range' })).toBe(false)
    expect(isEditableElement({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableElement(null)).toBe(false)
  })
})

describe('keyActionForEvent', () => {
  const input = { tagName: 'INPUT', type: 'text' }
  const panel = { contains: (n: unknown) => n === input }
  it('Esc no campo de nome do painel cancela; no campo do chat, não', () => {
    expect(keyActionForEvent({ ...key('Escape'), target: input }, panel, false)).toBe('cancel')
    expect(keyActionForEvent({ ...key('Escape'), target: { tagName: 'TEXTAREA' } }, panel, false)).toBeNull()
  })
  it('alvo que não é elemento (a janela) e sem painel', () => {
    expect(keyActionForEvent({ ...key('z', { ctrlKey: true }), target: {} }, null, false)).toBe('undo')
  })
})
