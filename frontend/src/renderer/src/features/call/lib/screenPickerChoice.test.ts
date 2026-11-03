import { describe, expect, it } from 'vitest'
import { pickerChoice } from './screenPickerChoice'

const screen = { id: 'screen:0:0' }
const game = { id: 'window:1:0' }
const browser = { id: 'window:2:0' }

describe('pickerChoice', () => {
  it('sem escolha: a primeira fonte da aba', () => {
    expect(pickerChoice([screen], null)).toBe(screen.id)
    expect(pickerChoice([game, browser], null)).toBe(game.id)
  })

  it('mantém a escolha enquanto ela está na aba', () => {
    expect(pickerChoice([game, browser], browser.id)).toBe(browser.id)
  })

  // Regressão: a janela escolhida virava a tela inteira, sem nada marcado na aba de janelas.
  it('nunca devolve fonte que não está na aba à vista', () => {
    expect(pickerChoice([game, browser], screen.id)).toBe(game.id)
    expect(pickerChoice([screen], browser.id)).toBe(screen.id)
  })

  it('aba vazia: nada para compartilhar', () => {
    expect(pickerChoice([], null)).toBeNull()
    expect(pickerChoice([], screen.id)).toBeNull()
  })
})
