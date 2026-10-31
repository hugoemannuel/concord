import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetchEventAccess: vi.fn() }))
vi.mock('../api/events', () => api)

import { resetEventAccessStore, useEventAccessStore } from './eventAccessStore'

const only = (create: boolean, edit: boolean, del: boolean) => ({
  create,
  edit,
  delete: del,
  configure: false,
  owner: false
})

describe('o que posso fazer com os eventos', () => {
  beforeEach(() => {
    resetEventAccessStore()
    api.fetchEventAccess.mockReset()
  })

  it('load guarda o acesso do servidor', async () => {
    api.fetchEventAccess.mockResolvedValue(only(true, false, false))
    await useEventAccessStore.getState().load('s1')
    expect(useEventAccessStore.getState().byServer.s1).toEqual(only(true, false, false))
  })

  it('o dono muda a configuração: quem já carregou o servidor recarrega', async () => {
    api.fetchEventAccess.mockResolvedValue(only(true, false, false))
    await useEventAccessStore.getState().load('s1')
    api.fetchEventAccess.mockResolvedValue(only(true, true, false))

    const handled = useEventAccessStore.getState().handleWsEvent({ type: 'event:access', payload: { server_id: 's1' } })
    expect(handled).toBe(true)
    await vi.waitFor(() => expect(useEventAccessStore.getState().byServer.s1.edit).toBe(true))
  })

  it('servidor que nunca foi carregado é ignorado (mas o aviso é reconhecido)', () => {
    expect(useEventAccessStore.getState().handleWsEvent({ type: 'event:access', payload: { server_id: 's9' } })).toBe(true)
    expect(api.fetchEventAccess).not.toHaveBeenCalled()
  })

  it('outros avisos não são com ele', () => {
    expect(useEventAccessStore.getState().handleWsEvent({ type: 'event:rsvp', payload: {} })).toBe(false)
  })

  it('falha ao carregar não derruba nada e mantém o que já havia', async () => {
    api.fetchEventAccess.mockResolvedValueOnce(only(true, true, true))
    await useEventAccessStore.getState().load('s1')
    api.fetchEventAccess.mockRejectedValue(new Error('rede'))
    await useEventAccessStore.getState().load('s1')
    expect(useEventAccessStore.getState().byServer.s1).toEqual(only(true, true, true))
  })
})
