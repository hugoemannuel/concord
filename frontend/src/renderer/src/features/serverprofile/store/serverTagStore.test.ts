import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => vi.fn())
vi.mock('../api/serverProfile', () => ({ lookupServerTags: lookup }))

import { TAG_CACHE_MS, useServerTagStore } from './serverTagStore'

const tagA = { server_id: 's1', name: 'AAA', badge: 'raio', color: '#000000' }
const tagB = { server_id: 's2', name: 'BBB', badge: 'lua', color: '#ffffff' }

const tagOf = (id: string): unknown => useServerTagStore.getState().byUser[id]?.tag

beforeEach(() => {
  vi.useFakeTimers()
  lookup.mockReset()
  useServerTagStore.setState({ byUser: {} })
})
afterEach(() => vi.useRealTimers())

describe('pedir a tag', () => {
  it('junta os pedidos de uma tela numa consulta só', async () => {
    lookup.mockResolvedValue({ ana: tagA })
    const { request } = useServerTagStore.getState()
    request('ana')
    request('bia')
    request('ana')
    await vi.runAllTimersAsync()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0][0].sort()).toEqual(['ana', 'bia'])
    expect(tagOf('ana')).toEqual(tagA)
    // Quem não usa tag fica guardado como "nenhuma", sem perguntar de novo.
    expect(tagOf('bia')).toBeNull()
  })

  it('não pergunta de novo enquanto está guardada; depois do prazo, sim', async () => {
    lookup.mockResolvedValue({ ana: tagA })
    const { request } = useServerTagStore.getState()
    request('ana')
    await vi.runAllTimersAsync()
    request('ana')
    await vi.runAllTimersAsync()
    expect(lookup).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(TAG_CACHE_MS + 1)
    request('ana')
    await vi.runAllTimersAsync()
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('não repete o id de uma consulta em andamento (a mensagem e a lista de membros)', async () => {
    let answer: (tags: unknown) => void = () => {}
    lookup.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const { request } = useServerTagStore.getState()
    request('ana')
    await vi.advanceTimersByTimeAsync(100)
    request('ana')
    await vi.advanceTimersByTimeAsync(100)
    expect(lookup).toHaveBeenCalledTimes(1)
    answer({ ana: tagA })
    await vi.runAllTimersAsync()
    expect(tagOf('ana')).toEqual(tagA)
  })

  it('divide listas grandes no limite da rota', async () => {
    lookup.mockResolvedValue({})
    const { request } = useServerTagStore.getState()
    for (let i = 0; i < 450; i++) request(`u${i}`)
    await vi.runAllTimersAsync()
    expect(lookup).toHaveBeenCalledTimes(3)
    expect(lookup.mock.calls[0][0]).toHaveLength(200)
  })

  it('rede fora: tenta de novo no próximo pedido', async () => {
    lookup.mockRejectedValueOnce(new Error('fora'))
    const { request } = useServerTagStore.getState()
    request('ana')
    await vi.runAllTimersAsync()
    expect(useServerTagStore.getState().byUser.ana).toBeUndefined()
    lookup.mockResolvedValue({ ana: tagA })
    request('ana')
    await vi.runAllTimersAsync()
    expect(tagOf('ana')).toEqual(tagA)
  })
})

describe('eventos', () => {
  const seed = (): void => {
    const now = Date.now()
    useServerTagStore.setState({
      byUser: { ana: { tag: tagA, at: now }, bia: { tag: tagB, at: now }, caio: { tag: tagA, at: now } }
    })
  }

  it('a pessoa troca de tag', () => {
    seed()
    useServerTagStore.getState().setUserTag('ana', tagB)
    expect(tagOf('ana')).toEqual(tagB)
  })

  it('saiu de um servidor: só some se era a tag dele', () => {
    seed()
    useServerTagStore.getState().setUserTag('ana', null, 's2')
    expect(tagOf('ana')).toEqual(tagA)
    useServerTagStore.getState().setUserTag('ana', null, 's1')
    expect(tagOf('ana')).toBeNull()
  })

  it('a tag do servidor mudou: pergunta de novo por quem a usava, e só por eles', async () => {
    seed()
    const next = { ...tagA, badge: 'lua' }
    lookup.mockResolvedValue({ ana: next })
    useServerTagStore.getState().refreshServer('s1')
    await vi.runAllTimersAsync()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0][0].sort()).toEqual(['ana', 'caio'])
    expect(tagOf('ana')).toEqual(next)
    // Nome trocado: quem usava fica sem tag até reaplicar.
    expect(tagOf('caio')).toBeNull()
    expect(tagOf('bia')).toEqual(tagB)
  })

  it('servidor que ninguém na tela usa: nem pergunta', async () => {
    seed()
    useServerTagStore.getState().refreshServer('outro')
    await vi.runAllTimersAsync()
    expect(lookup).not.toHaveBeenCalled()
  })
})
