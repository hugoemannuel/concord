import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { servers, call, playSound } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { create } = require('zustand') as typeof import('zustand')
  return {
    servers: create<{ currentServer: { id: string } | null }>(() => ({ currentServer: null })),
    call: { deafened: false },
    playSound: vi.fn()
  }
})
vi.mock('../../servers/store/serverStore', () => ({ useServerStore: servers }))
vi.mock('../../call/store/callStore', () => ({ useCallStore: { getState: () => call } }))
vi.mock('../../call/lib/sounds', () => ({ playSound: (name: string) => playSound(name) }))
vi.mock('../api/serverLevel', () => ({ fetchServerLevel: () => new Promise(() => {}) }))

import { useServerLevelStore } from '../store/serverLevelStore'
import { useServerLevelUpStore } from '../store/serverLevelUpStore'
import { REPLAY_COOLDOWN_MS } from '../../levels/lib/levelAttention'
import {
  isViewingServer,
  offerServerLevelUp,
  replayServerLevelUp,
  watchServerLevelUps
} from './serverLevelUpStart'

function memoryStorage(): Storage {
  const data: Record<string, string> = {}
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    }
  } as Storage
}

const doc = {
  visibilityState: 'visible',
  listeners: [] as (() => void)[],
  addEventListener: (_: string, l: () => void) => doc.listeners.push(l),
  removeEventListener: () => {}
}

const progress = (serverId: string, level: number): void =>
  useServerLevelStore.getState().apply({
    server_id: serverId,
    level,
    xp: 0,
    xp_into_level: 0,
    xp_for_next: 100
  })

const shown = (): { level: number; previous: number } | null => {
  const c = useServerLevelUpStore.getState().current
  return c ? { level: c.level, previous: c.previous } : null
}

describe('quem vê a subida de nível do servidor', () => {
  let stop: () => void = () => {}

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    doc.visibilityState = 'visible'
    doc.listeners = []
    vi.stubGlobal('document', doc)
    call.deafened = false
    playSound.mockReset()
    servers.setState({ currentServer: null })
    useServerLevelStore.getState().reset()
    useServerLevelUpStore.getState().close()
  })
  afterEach(() => {
    stop()
    vi.unstubAllGlobals()
  })

  it('quem está no servidor vê na hora, com som', () => {
    servers.setState({ currentServer: { id: 's1' } })
    expect(isViewingServer('s1')).toBe(true)
    expect(offerServerLevelUp('s1', 5, 4)).toBe(true)
    expect(shown()).toEqual({ level: 5, previous: 4 })
    expect(playSound).toHaveBeenCalledWith('levelFanfare')
    // O mesmo nível de novo (ex.: o evento repetido) não toca outra vez.
    useServerLevelUpStore.getState().close()
    expect(offerServerLevelUp('s1', 5, 4)).toBe(false)
    expect(shown()).toBeNull()
  })

  it('ensurdecido: a animação toca, o som não', () => {
    servers.setState({ currentServer: { id: 's1' } })
    call.deafened = true
    offerServerLevelUp('s1', 2, 1)
    expect(shown()).not.toBeNull()
    expect(playSound).not.toHaveBeenCalled()
  })

  it('quem estava em outro servidor vê uma vez, ao abrir o servidor', () => {
    stop = watchServerLevelUps()
    servers.setState({ currentServer: { id: 's2' } })
    expect(isViewingServer('s1')).toBe(false)
    expect(offerServerLevelUp('s1', 5, 4)).toBe(false)
    expect(shown()).toBeNull()

    // Abre o s1: quando o nível dele carrega, a animação toca do 4 ao 5.
    servers.setState({ currentServer: { id: 's1' } })
    expect(shown()).toBeNull()
    progress('s1', 5)
    expect(shown()).toEqual({ level: 5, previous: 4 })

    // Sai e volta: não toca de novo.
    useServerLevelUpStore.getState().close()
    servers.setState({ currentServer: { id: 's2' } })
    servers.setState({ currentServer: { id: 's1' } })
    expect(shown()).toBeNull()
  })

  it('na primeira visita só marca o nível atual; depois a subida ao vivo toca', () => {
    stop = watchServerLevelUps()
    progress('s1', 12)
    servers.setState({ currentServer: { id: 's1' } })
    expect(shown()).toBeNull()
    // O update chega antes do up e não pode "gastar" a animação.
    progress('s1', 13)
    expect(offerServerLevelUp('s1', 13, 12)).toBe(true)
    expect(shown()).toEqual({ level: 13, previous: 12 })
  })

  it('com a janela escondida espera ela voltar', () => {
    stop = watchServerLevelUps()
    progress('s1', 3)
    servers.setState({ currentServer: { id: 's1' } }) // marca o 3
    doc.visibilityState = 'hidden'
    progress('s1', 4)
    expect(offerServerLevelUp('s1', 4, 3)).toBe(false)
    doc.visibilityState = 'visible'
    doc.listeners.forEach((l) => l())
    expect(shown()).toEqual({ level: 4, previous: 3 })
  })

  describe('rever a animação pelo selo de nível', () => {
    let clock = 1_800_000_000_000
    beforeEach(() => {
      // Cada teste começa depois do intervalo mínimo do clique anterior.
      vi.useFakeTimers()
      clock += 10 * REPLAY_COOLDOWN_MS
      vi.setSystemTime(clock)
    })
    afterEach(() => vi.useRealTimers())

    it('toca o nível atual, com som, mesmo já visto e fora do servidor', () => {
      servers.setState({ currentServer: { id: 's2' } })
      progress('s1', 7)
      expect(replayServerLevelUp('s1')).toBe(true)
      expect(shown()).toEqual({ level: 7, previous: 6 })
      expect(playSound).toHaveBeenCalledTimes(1)
    })

    it('não gasta a animação da próxima subida de verdade', () => {
      servers.setState({ currentServer: { id: 's1' } })
      progress('s1', 7)
      replayServerLevelUp('s1')
      useServerLevelUpStore.getState().close()
      expect(offerServerLevelUp('s1', 8, 7)).toBe(true)
      expect(shown()).toEqual({ level: 8, previous: 7 })
    })

    it('ensurdecido: a animação toca, o som não', () => {
      call.deafened = true
      progress('s1', 3)
      expect(replayServerLevelUp('s1')).toBe(true)
      expect(playSound).not.toHaveBeenCalled()
    })

    it('sem o nível carregado não toca', () => {
      expect(replayServerLevelUp('s1')).toBe(false)
      expect(shown()).toBeNull()
    })

    it('no nível 1 a contagem não desce abaixo do 1', () => {
      progress('s1', 1)
      replayServerLevelUp('s1')
      expect(shown()).toEqual({ level: 1, previous: 1 })
    })

    it('cliques seguidos respeitam o intervalo mínimo', () => {
      progress('s1', 4)
      expect(replayServerLevelUp('s1')).toBe(true)
      useServerLevelUpStore.getState().close()
      vi.advanceTimersByTime(REPLAY_COOLDOWN_MS - 1)
      expect(replayServerLevelUp('s1')).toBe(false)
      expect(shown()).toBeNull()
      vi.advanceTimersByTime(1)
      expect(replayServerLevelUp('s1')).toBe(true)
    })
  })
})
