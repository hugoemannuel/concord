import { describe, expect, it, vi } from 'vitest'
import { nextGame, parseTasklist, visibleGameExes } from './gameDetector'

describe('parseTasklist', () => {
  it('lê o nome do executável de cada linha csv', () => {
    const out =
      '"System Idle Process","0","Services","0","8 K"\r\n"cs2.exe","1234","Console","1","900 K"\r\n'
    expect(parseTasklist(out)).toEqual(['System Idle Process', 'cs2.exe'])
  })

  it('ignora linhas que não são csv', () => {
    expect(parseTasklist('INFO: nenhuma tarefa\n\n')).toEqual([])
  })
})

const ICON = '0e56e01c18bf303a65ba60dddfa842cc85d1da33'

describe('nextGame', () => {
  it('começa a contar quando o jogo aparece', () => {
    expect(nextGame(null, ['chrome.exe', 'cs2.exe'], 100)).toEqual({
      name: 'Counter-Strike 2',
      startedAt: 100
    })
  })

  it('mantém o início enquanto é o mesmo jogo', () => {
    const before = { name: 'Counter-Strike 2', startedAt: 100 }
    expect(nextGame(before, ['cs2.exe'], 999)).toBe(before)
  })

  it('troca de jogo com início novo', () => {
    const before = { name: 'Counter-Strike 2', startedAt: 100 }
    expect(nextGame(before, ['tslgame.exe'], 500)).toEqual({
      name: 'PUBG: BATTLEGROUNDS',
      startedAt: 500
    })
  })

  it('usa o jogo da Steam quando o catálogo não conhece o executável', () => {
    expect(
      nextGame(null, ['chrome.exe'], 100, { appId: 2661300, name: 'Grounded 2', iconHash: ICON })
    ).toEqual({
      name: 'Grounded 2',
      startedAt: 100,
      appId: 2661300,
      iconHash: ICON
    })
  })

  it('o catálogo vence o jogo da Steam', () => {
    expect(
      nextGame(null, ['cs2.exe'], 100, { appId: 730, name: 'Counter-Strike: Global Offensive' })
    ).toEqual({
      name: 'Counter-Strike 2',
      startedAt: 100
    })
  })

  it('mantém o início do jogo da Steam enquanto continua aberto', () => {
    const before = { name: 'Grounded 2', startedAt: 100 }
    expect(nextGame(before, ['chrome.exe'], 999, { appId: 2661300, name: 'Grounded 2' })).toBe(
      before
    )
  })

  it('some quando o jogo fecha', () => {
    expect(nextGame({ name: 'Counter-Strike 2', startedAt: 100 }, ['chrome.exe'], 900)).toBeNull()
  })
})

describe('visibleGameExes', () => {
  it('nem pergunta pelas janelas quando nenhum jogo precisa', async () => {
    const check = vi.fn()
    expect(await visibleGameExes(['cs2.exe'], check)).toEqual(['cs2.exe'])
    expect(check).not.toHaveBeenCalled()
  })

  it('o Roblox que sobrou em segundo plano, sem janela, não vira atividade', async () => {
    const check = vi.fn(async () => new Set<string>())
    const exes = await visibleGameExes(['chrome.exe', 'RobloxPlayerBeta.exe'], check)
    expect(check).toHaveBeenCalledWith(['robloxplayerbeta.exe'])
    expect(nextGame(null, exes, 100)).toBeNull()
  })

  it('o Roblox aberto, com janela, vira atividade', async () => {
    const check = async (): Promise<Set<string>> => new Set(['robloxplayerbeta.exe'])
    const exes = await visibleGameExes(['RobloxPlayerBeta.exe'], check)
    expect(nextGame(null, exes, 100)).toEqual({ name: 'Roblox', startedAt: 100 })
  })
})
