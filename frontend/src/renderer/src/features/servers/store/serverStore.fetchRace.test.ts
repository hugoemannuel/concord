import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '../api/channels'

// Trocar de servidor depressa dispara duas buscas; a resposta da mais velha
// pode chegar depois da nova. Só a última pedida pode gravar a lista.

const listChannels = vi.fn()
vi.mock('../api/channels', () => ({
  listChannels: (...args: unknown[]) => listChannels(...args)
}))
vi.mock('../api/servers', () => ({}))
vi.mock('../api/roles', () => ({}))
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 't' }) }
}))

const { useServerStore } = await import('./serverStore')

const channel = (id: string, serverId: string): Channel =>
  ({ id, server_id: serverId, name: id, type: 'text' }) as Channel

/** Resposta HTTP que o teste resolve quando quiser. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve: (v: T) => void = () => {}
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  listChannels.mockReset()
  useServerStore.setState({ channels: [], channelsLoadedFor: null })
})

describe('fetchChannels', () => {
  it('a resposta atrasada do servidor anterior não sobrescreve a do atual', async () => {
    const a = deferred<Channel[]>()
    const b = deferred<Channel[]>()
    listChannels.mockImplementation((id: string) => (id === 'A' ? a.promise : b.promise))

    const first = useServerStore.getState().fetchChannels('A')
    const second = useServerStore.getState().fetchChannels('B')
    b.resolve([channel('b1', 'B')])
    await second
    a.resolve([channel('a1', 'A')])
    await first

    const { channels, channelsLoadedFor } = useServerStore.getState()
    expect(channels.map((c) => c.id)).toEqual(['b1'])
    expect(channelsLoadedFor).toBe('B')
  })

  it('o erro da busca antiga também não apaga a lista do servidor atual', async () => {
    const a = deferred<Channel[]>()
    listChannels.mockImplementation((id: string) =>
      id === 'A' ? a.promise.then(() => Promise.reject(new Error('x'))) : Promise.resolve([channel('b1', 'B')])
    )

    const first = useServerStore.getState().fetchChannels('A')
    await useServerStore.getState().fetchChannels('B')
    a.resolve([])
    await first

    expect(useServerStore.getState().channels.map((c) => c.id)).toEqual(['b1'])
  })

  it('no mesmo servidor vale a última pedida (criar canal e buscar de novo)', async () => {
    const velha = deferred<Channel[]>()
    const nova = deferred<Channel[]>()
    listChannels.mockReturnValueOnce(velha.promise).mockReturnValueOnce(nova.promise)

    const first = useServerStore.getState().fetchChannels('A')
    const second = useServerStore.getState().fetchChannels('A')
    nova.resolve([channel('a1', 'A'), channel('a2', 'A')])
    await second
    velha.resolve([channel('a1', 'A')])
    await first

    expect(useServerStore.getState().channels.map((c) => c.id)).toEqual(['a1', 'a2'])
  })

  it('uma busca sozinha grava normalmente', async () => {
    listChannels.mockResolvedValue([channel('a1', 'A')])
    await useServerStore.getState().fetchChannels('A')
    expect(useServerStore.getState().channels).toHaveLength(1)
    expect(useServerStore.getState().channelsLoadedFor).toBe('A')
  })
})
