import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolve = vi.hoisted(() => vi.fn())
vi.mock('../api/expressions', () => ({ resolveExpressions: resolve, MAX_RESOLVE: 2 }))

import { requestOrigin, resetExpressionOrigins, useExpressionOrigins } from './expressionOrigins'

const flush = async (): Promise<void> => {
  await vi.runAllTimersAsync()
}

beforeEach(() => {
  vi.useFakeTimers()
  resolve.mockReset()
  resetExpressionOrigins()
})

describe('expressionOrigins', () => {
  it('junta os pedidos do mesmo instante numa consulta só', async () => {
    resolve.mockResolvedValue({ emojis: [{ id: 'a', name: 'festa' }, { id: 'b', name: 'gato' }], stickers: [] })
    requestOrigin('emoji', 'a')
    requestOrigin('emoji', 'b')
    requestOrigin('emoji', 'a')
    await flush()
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith(['a', 'b'], [])
    expect(useExpressionOrigins.getState().emoji.a?.name).toBe('festa')
  })

  it('o que não voltou fica marcado como não disponível, sem perguntar de novo', async () => {
    resolve.mockResolvedValue({ emojis: [], stickers: [] })
    requestOrigin('sticker', 's')
    await flush()
    expect(useExpressionOrigins.getState().sticker.s).toBeNull()
    requestOrigin('sticker', 's')
    await flush()
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('pedido grande vai em partes', async () => {
    resolve.mockResolvedValue({ emojis: [], stickers: [] })
    for (const id of ['a', 'b', 'c']) requestOrigin('emoji', id)
    await flush()
    expect(resolve.mock.calls.map((c) => c[0])).toEqual([['a', 'b'], ['c']])
  })

  it('falha de rede não marca nada: dá para pedir de novo', async () => {
    resolve.mockRejectedValueOnce(new Error('offline'))
    requestOrigin('emoji', 'a')
    await flush()
    expect(useExpressionOrigins.getState().emoji.a).toBeUndefined()
    resolve.mockResolvedValue({ emojis: [{ id: 'a', name: 'festa' }], stickers: [] })
    requestOrigin('emoji', 'a')
    await flush()
    expect(useExpressionOrigins.getState().emoji.a?.name).toBe('festa')
  })
})
