import { beforeEach, describe, expect, it, vi } from 'vitest'

const getCard = vi.hoisted(() => vi.fn())
vi.mock('../api/serverProfile', () => ({ getServerCard: getCard }))

import { resetServerProfileRequests, useServerProfileStore } from './serverProfileStore'

const profile = { description: 'oi' }

beforeEach(() => {
  getCard.mockReset()
  resetServerProfileRequests()
  useServerProfileStore.setState({ byServer: {} })
})

describe('serverProfileStore', () => {
  it('busca uma vez e guarda o perfil de quem é membro', async () => {
    getCard.mockResolvedValue({ locked: false, is_member: true, profile })
    const { load } = useServerProfileStore.getState()
    load('s1')
    load('s1')
    await vi.waitFor(() => expect(useServerProfileStore.getState().byServer.s1).toBe(profile))
    expect(getCard).toHaveBeenCalledTimes(1)
  })

  it('não guarda o perfil de quem está fora', () => {
    useServerProfileStore.getState().setCard('s1', {
      locked: false,
      is_member: false,
      member_count: 1,
      online_count: 0,
      profile: profile as never
    })
    expect(useServerProfileStore.getState().byServer.s1).toBeUndefined()
  })

  it('falhou: pode pedir de novo', async () => {
    getCard.mockRejectedValueOnce(new Error('fora'))
    const { load } = useServerProfileStore.getState()
    load('s1')
    await vi.waitFor(() => expect(getCard).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    getCard.mockResolvedValue({ locked: false, is_member: true, profile })
    load('s1')
    await vi.waitFor(() => expect(useServerProfileStore.getState().byServer.s1).toBe(profile))
  })
})
