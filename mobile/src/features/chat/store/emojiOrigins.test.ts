import { useAuthStore } from '../../auth/store/authStore'
import { resolveEmojis } from '../api/expressions'
import { requestEmojiOrigin, resetEmojiOrigins, useEmojiOrigins } from './emojiOrigins'

jest.mock('../api/expressions', () => ({ MAX_RESOLVE: 2, resolveEmojis: jest.fn() }))

const resolve = jest.mocked(resolveEmojis)
const flush = async (): Promise<void> => {
  await jest.runAllTimersAsync()
}

beforeEach(() => {
  jest.useFakeTimers()
  resolve.mockReset()
  resetEmojiOrigins()
})

afterEach(() => jest.useRealTimers())

describe('emojiOrigins', () => {
  it('junta os pedidos do mesmo instante', async () => {
    resolve.mockResolvedValue({ emojis: [{ id: 'a', name: 'festa' }] })
    requestEmojiOrigin('a')
    requestEmojiOrigin('a')
    requestEmojiOrigin('b')
    await flush()
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith(['a', 'b'])
    expect(useEmojiOrigins.getState().byId.a?.name).toBe('festa')
    expect(useEmojiOrigins.getState().byId.b).toBeNull()
  })

  it('o que já se sabe não pergunta de novo', async () => {
    resolve.mockResolvedValue({ emojis: [] })
    requestEmojiOrigin('a')
    await flush()
    requestEmojiOrigin('a')
    await flush()
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('pedido grande vai em partes', async () => {
    resolve.mockResolvedValue({ emojis: [] })
    for (const id of ['a', 'b', 'c']) requestEmojiOrigin(id)
    await flush()
    expect(resolve.mock.calls.map((c) => c[0])).toEqual([['a', 'b'], ['c']])
  })

  it('falha de rede deixa pedir de novo', async () => {
    resolve.mockRejectedValueOnce(new Error('offline'))
    requestEmojiOrigin('a')
    await flush()
    expect(useEmojiOrigins.getState().byId.a).toBeUndefined()
    resolve.mockResolvedValue({ emojis: [{ id: 'a', name: 'festa' }] })
    requestEmojiOrigin('a')
    await flush()
    expect(useEmojiOrigins.getState().byId.a?.name).toBe('festa')
  })

  it('trocar de conta esquece o que a outra podia conhecer', async () => {
    resolve.mockResolvedValue({ emojis: [{ id: 'a', name: 'festa' }] })
    requestEmojiOrigin('a')
    await flush()
    useAuthStore.setState({ user: { id: 'outra' } as never })
    expect(useEmojiOrigins.getState().byId).toEqual({})
    useAuthStore.setState({ user: null })
  })
})
