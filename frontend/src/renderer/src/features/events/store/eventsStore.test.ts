import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventInput, ServerEvent } from '../api/events'

const api = vi.hoisted(() => ({
  fetchEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  setRsvp: vi.fn(),
  clearRsvp: vi.fn()
}))
vi.mock('../api/events', () => api)

import { resetEventsStore, useEventsStore } from './eventsStore'

function ev(id: string, next = '2026-12-01T20:00:00Z', extra: Partial<ServerEvent> = {}): ServerEvent {
  return {
    id,
    server_id: 's1',
    duration_minutes: 120,
    game_name: null,
    voice_channel_id: null,
    text_channel_id: null,
    title: `Evento ${id}`,
    description: '',
    banner_id: null,
    starts_at: next,
    next_start_at: next,
    recurrence: 'none',
    recurrence_until: null,
    recurrence_count: null,
    reminder_offsets: [10, 5],
    created_by: 'u1',
    going_count: 0,
    my_rsvp: null,
    ...extra
  }
}

const input = {} as EventInput
const ids = (serverId = 's1'): string[] => (useEventsStore.getState().byServer[serverId] ?? []).map((e) => e.id)

describe('store dos eventos', () => {
  beforeEach(() => {
    resetEventsStore()
    Object.values(api).forEach((fn) => fn.mockReset())
  })

  it('load guarda os eventos do servidor', async () => {
    api.fetchEvents.mockResolvedValue([ev('a'), ev('b', '2026-12-02T20:00:00Z')])
    await useEventsStore.getState().load('s1')
    expect(ids()).toEqual(['a', 'b'])
  })

  it('criar, editar e cancelar atualizam a lista', async () => {
    api.fetchEvents.mockResolvedValue([ev('a')])
    await useEventsStore.getState().load('s1')

    api.createEvent.mockResolvedValue(ev('b', '2026-12-02T20:00:00Z'))
    await useEventsStore.getState().create('s1', input)
    expect(ids()).toEqual(['a', 'b'])

    api.updateEvent.mockResolvedValue(ev('a', '2026-12-09T20:00:00Z', { title: 'Novo' }))
    await useEventsStore.getState().update('s1', 'a', input)
    expect(ids()).toEqual(['b', 'a'])

    api.cancelEvent.mockResolvedValue(undefined)
    await useEventsStore.getState().cancel('s1', 'b')
    expect(ids()).toEqual(['a'])
  })

  it('responder é otimista e chama a API certa', async () => {
    api.fetchEvents.mockResolvedValue([ev('a')])
    await useEventsStore.getState().load('s1')
    let release: () => void = () => {}
    api.setRsvp.mockReturnValue(new Promise<void>((resolve) => (release = resolve)))

    const pending = useEventsStore.getState().respond('s1', 'a', true)
    expect(useEventsStore.getState().byServer.s1[0]).toMatchObject({ my_rsvp: true, going_count: 1 })
    release()
    await pending
    expect(api.setRsvp).toHaveBeenCalledWith('s1', 'a', true)

    api.clearRsvp.mockResolvedValue(undefined)
    await useEventsStore.getState().respond('s1', 'a', null)
    expect(api.clearRsvp).toHaveBeenCalledWith('s1', 'a')
    expect(useEventsStore.getState().byServer.s1[0]).toMatchObject({ my_rsvp: null, going_count: 0 })
  })

  it('volta a resposta anterior se a API falhar', async () => {
    api.fetchEvents.mockResolvedValue([ev('a', undefined, { my_rsvp: true, going_count: 2 })])
    await useEventsStore.getState().load('s1')
    api.setRsvp.mockRejectedValue(new Error('fora do ar'))

    await expect(useEventsStore.getState().respond('s1', 'a', false)).rejects.toThrow('fora do ar')
    expect(useEventsStore.getState().byServer.s1[0]).toMatchObject({ my_rsvp: true, going_count: 2 })
  })
})

describe('eventos em tempo real', () => {
  beforeEach(() => {
    resetEventsStore()
    Object.values(api).forEach((fn) => fn.mockReset())
  })

  const send = (type: string, payload: unknown): boolean =>
    useEventsStore.getState().handleWsEvent({ type, payload })

  it('ignora (mas reconhece) evento de servidor que ainda não foi carregado', () => {
    expect(send('event:create', ev('a'))).toBe(true)
    expect(useEventsStore.getState().byServer.s1).toBeUndefined()
  })

  it('não é com ele: outros tipos de evento', () => {
    expect(send('message:create', {})).toBe(false)
  })

  it('event:create entra na lista e event:delete sai', async () => {
    api.fetchEvents.mockResolvedValue([])
    await useEventsStore.getState().load('s1')
    send('event:create', ev('a'))
    expect(ids()).toEqual(['a'])
    send('event:delete', { server_id: 's1', event_id: 'a' })
    expect(ids()).toEqual([])
  })

  it('event:update recarrega a lista do servidor (a minha resposta não vem no aviso)', async () => {
    api.fetchEvents.mockResolvedValue([ev('a', undefined, { my_rsvp: true, going_count: 1 })])
    await useEventsStore.getState().load('s1')
    api.fetchEvents.mockClear()
    api.fetchEvents.mockResolvedValue([ev('a', undefined, { title: 'Editado', my_rsvp: true, going_count: 1 })])

    send('event:update', ev('a', undefined, { title: 'Editado' }))
    await vi.waitFor(() => expect(useEventsStore.getState().byServer.s1[0].title).toBe('Editado'))
    expect(api.fetchEvents).toHaveBeenCalledWith('s1')
    expect(useEventsStore.getState().byServer.s1[0].my_rsvp).toBe(true)
  })

  it('event:rsvp troca só a contagem', async () => {
    api.fetchEvents.mockResolvedValue([ev('a', undefined, { my_rsvp: true, going_count: 1 })])
    await useEventsStore.getState().load('s1')
    send('event:rsvp', { server_id: 's1', event_id: 'a', going_count: 5 })
    expect(useEventsStore.getState().byServer.s1[0]).toMatchObject({ going_count: 5, my_rsvp: true })
  })
})
