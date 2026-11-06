import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Harness mínimo: o efeito roda na hora, sem DOM simulado.
const harness = vi.hoisted(() => ({
  cleanup: undefined as (() => void) | void,
  wsOpen: true,
  listeners: [] as ((event: { type: string; payload: unknown }) => void)[],
  list: vi.fn(),
  setServerCalls: vi.fn()
}))
vi.mock('react', () => ({
  useEffect: (effect: () => (() => void) | void) => {
    harness.cleanup = effect()
  }
}))
vi.mock('../../../shared/store/connectionStore', () => ({
  useConnectionStore: (select: (s: { ws: { phase: string } }) => unknown) =>
    select({ ws: { phase: harness.wsOpen ? 'open' : 'lost' } })
}))
vi.mock('../../../shared/api/ws', () => ({
  onWsEvent: (listener: (typeof harness.listeners)[number]) => {
    harness.listeners.push(listener)
    return () => harness.listeners.splice(harness.listeners.indexOf(listener), 1)
  }
}))
vi.mock('../api/calls', () => ({ listActiveServerCalls: harness.list }))
vi.mock('../store/callStore', () => ({
  useCallStore: { getState: () => ({ setServerCalls: harness.setServerCalls }) }
}))

import { useServerCallsLoad } from './useServerCallsLoad'

const state = (serverId: string) => ({
  call: { id: 'c-' + serverId, channel_id: 'v-' + serverId, server_id: serverId },
  participants: [{ user_id: 'ana' }]
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  harness.wsOpen = true
  harness.listeners.length = 0
  harness.list.mockImplementation(async (id: string) => [state(id)])
})
afterEach(() => {
  if (harness.cleanup) harness.cleanup()
  harness.cleanup = undefined
  vi.useRealTimers()
})

describe('useServerCallsLoad', () => {
  it('lê cada servidor uma vez e não fica relendo (os eventos mantêm a lista)', async () => {
    useServerCallsLoad(['s1', 's2'])
    await vi.advanceTimersByTimeAsync(60_000)

    expect(harness.list.mock.calls.map(([id]) => id)).toEqual(['s1', 's2'])
    expect(harness.setServerCalls).toHaveBeenCalledWith('s1', { 'v-s1': state('s1') })
    expect(harness.setServerCalls).toHaveBeenCalledWith('s2', { 'v-s2': state('s2') })
  })

  it('com o WebSocket fora do ar não lê (a reconexão lê)', async () => {
    harness.wsOpen = false
    useServerCallsLoad(['s1'])
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.list).not.toHaveBeenCalled()
  })

  it('permissões mudaram num servidor da lista: relê só ele', async () => {
    useServerCallsLoad(['s1', 's2'])
    await vi.advanceTimersByTimeAsync(0)
    harness.list.mockClear()

    harness.listeners.forEach((l) => l({ type: 'server:permissions:invalidate', payload: { server_id: 's2' } }))
    harness.listeners.forEach((l) => l({ type: 'server:permissions:invalidate', payload: { server_id: 'outro' } }))
    await vi.advanceTimersByTimeAsync(0)

    expect(harness.list.mock.calls.map(([id]) => id)).toEqual(['s2'])
  })

  it('falha ao ler não derruba nada nem mexe na lista', async () => {
    harness.list.mockRejectedValue(new Error('rede'))
    useServerCallsLoad(['s1'])
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.setServerCalls).not.toHaveBeenCalled()
  })
})
