import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ request }))

import { createChannel, listChannels } from './channels'

describe('listChannels', () => {
  beforeEach(() => request.mockReset())

  it('pedidos do mesmo evento (mesmo tick) viram um só', async () => {
    request.mockResolvedValue([{ id: 'c1' }])

    const [a, b] = await Promise.all([listChannels('s1'), listChannels('s1')])

    expect(request).toHaveBeenCalledTimes(1)
    expect(a).toEqual([{ id: 'c1' }])
    expect(b).toBe(a)
  })

  it('servidores diferentes não se misturam', async () => {
    request.mockResolvedValue([])

    await Promise.all([listChannels('s1'), listChannels('s2')])

    expect(request).toHaveBeenCalledTimes(2)
  })

  it('um pedido mais antigo, ainda no ar, não é reaproveitado depois (pode ser de antes da mudança)', async () => {
    let resolveOld: (v: unknown) => void = () => {}
    request.mockReturnValueOnce(new Promise((r) => (resolveOld = r))).mockResolvedValueOnce([{ id: 'novo' }])

    const old = listChannels('s1')
    await Promise.resolve() // o evento seguinte chega noutro tick
    const fresh = listChannels('s1')

    expect(request).toHaveBeenCalledTimes(2)
    resolveOld([{ id: 'velho' }])
    expect(await fresh).toEqual([{ id: 'novo' }])
    expect(await old).toEqual([{ id: 'velho' }])
  })
})

describe('criar canal com categoria', () => {
  it('envia a categoria junto com o canal privado', async () => {
    request.mockReset()
    request.mockResolvedValue({ id: 'c' })
    await createChannel('s', 'geral', 'text', { private: true, roleIds: ['r'], categoryId: 'cat' })
    expect(request).toHaveBeenCalledWith('/servers/s/channels', {
      method: 'POST', body: JSON.stringify({ name: 'geral', type: 'text', category_id: 'cat', private: true, role_ids: ['r'] })
    })
  })
})
