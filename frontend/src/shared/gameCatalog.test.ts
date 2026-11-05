import { describe, expect, it } from 'vitest'
import {
  GAMES,
  detectGame,
  exesNeedingWindow,
  gameAccent,
  gameForExe,
  withoutHiddenGames
} from './gameCatalog'

describe('gameCatalog', () => {
  it('reconhece o executável sem diferenciar maiúsculas', () => {
    expect(gameForExe('VALORANT-Win64-Shipping.exe')?.name).toBe('VALORANT')
    expect(gameForExe(' TslGame.exe ')?.name).toBe('PUBG: BATTLEGROUNDS')
  })

  it('ignora processo fora do catálogo', () => {
    expect(gameForExe('notepad.exe')).toBeUndefined()
    expect(detectGame(['explorer.exe', 'chrome.exe'])).toBeUndefined()
  })

  it('devolve o primeiro jogo encontrado', () => {
    expect(detectGame(['chrome.exe', 'cs2.exe', 'tslgame.exe'])?.name).toBe('Counter-Strike 2')
  })

  it('não repete executável entre jogos', () => {
    const exes = GAMES.flatMap((game) => game.exes)
    expect(new Set(exes).size).toBe(exes.length)
    expect(exes.every((exe) => exe === exe.toLowerCase())).toBe(true)
  })

  it('devolve a cor pelo nome', () => {
    expect(gameAccent('VALORANT')).toBe('#fd4556')
    expect(gameAccent('Outro')).toBeUndefined()
  })

  it('reconhece o LoL no cliente (saguão, fila, seleção de campeões), não só na partida', () => {
    expect(gameForExe('LeagueClientUx.exe')?.name).toBe('League of Legends')
    expect(gameForExe('League of Legends.exe')?.name).toBe('League of Legends')
  })
})

describe('jogos que só contam com janela aberta', () => {
  it('pede a conferência da janela só do Roblox em andamento', () => {
    expect(exesNeedingWindow(['chrome.exe', 'RobloxPlayerBeta.exe', 'cs2.exe'])).toEqual([
      'robloxplayerbeta.exe'
    ])
    expect(exesNeedingWindow(['cs2.exe'])).toEqual([])
  })

  it('ignora o Roblox que ficou em segundo plano sem janela depois de fechado', () => {
    const running = ['chrome.exe', 'RobloxPlayerBeta.exe']
    expect(detectGame(withoutHiddenGames(running, new Set()))).toBeUndefined()
  })

  it('mantém o Roblox com janela aberta', () => {
    const running = ['chrome.exe', 'RobloxPlayerBeta.exe']
    const visible = new Set(['robloxplayerbeta.exe'])
    expect(detectGame(withoutHiddenGames(running, visible))?.name).toBe('Roblox')
  })

  it('não mexe nos jogos que não precisam de janela', () => {
    expect(withoutHiddenGames(['cs2.exe', 'chrome.exe'], new Set())).toEqual([
      'cs2.exe',
      'chrome.exe'
    ])
  })
})
