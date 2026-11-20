import { describe, expect, it } from 'vitest'
import { MUSIC_COMMANDS } from '../../music/lib/music'
import { SLASH_MENU_IDLE, slashMenuView, type SlashMenuState } from './slashMenu'

const view = (
  input: string,
  state: SlashMenuState = SLASH_MENU_IDLE
): { commands: string[]; highlight: number } => {
  const { items, highlight } = slashMenuView(input, MUSIC_COMMANDS, state)
  return { commands: items.map((c) => c.command), highlight }
}

describe('slashMenuView', () => {
  it('comando pela metade: o primeiro já vem destacado (Enter/Tab completam)', () => {
    expect(view('/')).toEqual({ commands: ['/play', '/skip', '/fila', '/help'], highlight: 0 })
    expect(view('/pu')).toEqual({ commands: ['/skip'], highlight: 0 })
  })

  it('comando ou alias já inteiro: sem destaque, para o Enter enviar como sempre', () => {
    expect(view('/skip')).toEqual({ commands: ['/skip'], highlight: -1 })
    expect(view('/S')).toEqual({ commands: ['/skip'], highlight: -1 })
    // "/p" é alias do /play e começo do /pular: os dois aparecem, nenhum destacado.
    expect(view('/p')).toEqual({ commands: ['/play', '/skip'], highlight: -1 })
  })

  it('sem sugestão, não há lista nem destaque', () => {
    expect(view('oi')).toEqual({ commands: [], highlight: -1 })
    expect(view('/play queen')).toEqual({ commands: [], highlight: -1 })
  })

  it('o destaque escolhido (setas, mouse) vale enquanto o texto for o mesmo', () => {
    const state: SlashMenuState = { choice: { input: '/', index: 2 }, dismissed: null }
    expect(view('/', state).highlight).toBe(2)
    expect(view('/skip', { ...state, choice: { input: '/skip', index: 0 } }).highlight).toBe(0)
    // Digitou mais: volta ao destaque padrão.
    expect(view('/f', state)).toEqual({ commands: ['/fila'], highlight: 0 })
  })

  it('Esc esconde a lista até o texto mudar', () => {
    const state: SlashMenuState = { choice: null, dismissed: '/pl' }
    expect(view('/pl', state)).toEqual({ commands: [], highlight: -1 })
    expect(view('/pla', state)).toEqual({ commands: ['/play'], highlight: 0 })
  })
})
