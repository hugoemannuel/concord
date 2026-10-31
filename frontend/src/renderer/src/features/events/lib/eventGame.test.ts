import { describe, expect, it } from 'vitest'
import { GAMES } from '../../../../../shared/gameCatalog'
import {
  GAME_OPTIONS,
  NO_GAME,
  OTHER_GAME,
  gameChoiceOf,
  gameNameOf,
  isPlayingGame,
  normalizeGame
} from './eventGame'

describe('jogo do evento', () => {
  it('oferece os mesmos jogos do catálogo da atividade, na ordem dele', () => {
    expect(GAME_OPTIONS).toHaveLength(GAMES.length)
    expect(GAME_OPTIONS.map((o) => o.value)).toEqual(GAMES.map((g) => g.name))
  })

  it('"nenhum" e "outro" não colidem com nome de jogo', () => {
    expect(GAME_OPTIONS.some((o) => o.value === NO_GAME || o.value === OTHER_GAME)).toBe(false)
  })

  it('sem jogo salvo, o seletor fica em "nenhum"', () => {
    expect(gameChoiceOf(null)).toEqual({ choice: NO_GAME, custom: '' })
    expect(gameChoiceOf('')).toEqual({ choice: NO_GAME, custom: '' })
  })

  it('jogo do catálogo abre o seletor nele', () => {
    expect(gameChoiceOf('Minecraft')).toEqual({ choice: 'Minecraft', custom: '' })
  })

  it('jogo fora do catálogo abre "Outro jogo…" já preenchido', () => {
    expect(gameChoiceOf('Meu jogo de tabuleiro')).toEqual({
      choice: OTHER_GAME,
      custom: 'Meu jogo de tabuleiro'
    })
  })

  it('gameNameOf devolve o nome escolhido (limpando o que foi digitado)', () => {
    expect(gameNameOf(NO_GAME, 'sobra')).toBe('')
    expect(gameNameOf('VALORANT', 'sobra')).toBe('VALORANT')
    expect(gameNameOf(OTHER_GAME, '  Xadrez  ')).toBe('Xadrez')
    expect(gameNameOf(OTHER_GAME, '   ')).toBe('')
  })

  it('normalizeGame ignora maiúsculas, acentos e espaços nas pontas', () => {
    expect(normalizeGame('  Pokémon  ')).toBe('pokemon')
    expect(normalizeGame('COUNTER-STRIKE 2')).toBe('counter-strike 2')
  })

  it('o selo casa a atividade com o jogo do evento pelo nome normalizado', () => {
    expect(isPlayingGame('valorant', 'VALORANT')).toBe(true)
    expect(isPlayingGame(' Pokemon ', 'Pokémon')).toBe(true)
  })

  it('sem jogo no evento, sem atividade ou com outro jogo, não há selo', () => {
    expect(isPlayingGame('VALORANT', null)).toBe(false)
    expect(isPlayingGame(undefined, 'VALORANT')).toBe(false)
    expect(isPlayingGame('Minecraft', 'VALORANT')).toBe(false)
    expect(isPlayingGame('', '')).toBe(false)
  })
})
