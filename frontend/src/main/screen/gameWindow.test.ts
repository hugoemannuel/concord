import { describe, expect, it, vi } from 'vitest'
import { PreferredSource, exeProcessNames, findGameWindow, pickGameWindow } from './gameWindow'

const win = (hwnd: number, name: string): { id: string; name: string } => ({
  id: `window:${hwnd}:0`,
  name
})

describe('exeProcessNames', () => {
  it('devolve os executáveis do catálogo sem o .exe', () => {
    expect(exeProcessNames('Apex Legends')).toEqual(['r5apex', 'r5apex_dx12'])
  })

  it('jogo fora do catálogo não tem executável conhecido', () => {
    expect(exeProcessNames('Jogo Qualquer')).toEqual([])
  })
})

describe('pickGameWindow', () => {
  it('jogo fora da lista (minimizado): usa a janela do processo dele', () => {
    expect(pickGameWindow([win(10, 'Navegador')], ['30'], 'VALORANT')).toBe('window:30:0')
  })

  const sources = [win(10, 'Discord'), win(20, 'Counter-Strike 2'), win(30, 'Bloco de notas')]

  it('prefere a janela do processo do jogo', () => {
    expect(pickGameWindow(sources, ['30'], 'Counter-Strike 2')).toBe('window:30:0')
  })

  it('sem processo com janela, cai para o título que traz o nome do jogo', () => {
    expect(pickGameWindow(sources, [], 'counter-strike 2')).toBe('window:20:0')
  })

  it('ignora telas inteiras e devolve null se nada combina', () => {
    const only = [{ id: 'screen:0:0', name: 'Counter-Strike 2' }]
    expect(pickGameWindow(only, [], 'Counter-Strike 2')).toBeNull()
    expect(pickGameWindow(sources, [], 'Outro')).toBeNull()
  })
})

describe('PreferredSource', () => {
  it('vale uma única vez', () => {
    const preferred = new PreferredSource(() => 0)
    preferred.set('window:1:0')
    expect(preferred.take()).toBe('window:1:0')
    expect(preferred.take()).toBeNull()
  })

  it('expira se ninguém pediu a captura a tempo', () => {
    let now = 0
    const preferred = new PreferredSource(() => now)
    preferred.set('window:1:0')
    now = 60_000
    expect(preferred.take()).toBeNull()
  })

  it('clear descarta', () => {
    const preferred = new PreferredSource(() => 0)
    preferred.set('window:1:0')
    preferred.clear()
    expect(preferred.take()).toBeNull()
  })
})

describe('findGameWindow', () => {
  const windows = async (): Promise<Array<{ id: string; name: string }>> => [win(7, 'Fortnite')]

  it('junta janelas e processos do jogo', async () => {
    const hwnds = vi.fn().mockResolvedValue(['7'])
    expect(await findGameWindow('Fortnite', { windows, hwnds })).toBe('window:7:0')
    expect(hwnds).toHaveBeenCalledWith(['fortniteclient-win64-shipping'])
  })

  it('nome que não é texto não procura nada', async () => {
    const hwnds = vi.fn()
    expect(await findGameWindow(42, { windows, hwnds })).toBeNull()
    expect(hwnds).not.toHaveBeenCalled()
  })
})
