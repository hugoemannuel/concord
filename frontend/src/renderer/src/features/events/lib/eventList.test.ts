import { describe, expect, it } from 'vitest'
import type { ServerEvent } from '../api/events'
import { applyRsvp, removeEvent, setGoingCount, upsertEvent } from './eventList'

function ev(id: string, next: string, extra: Partial<ServerEvent> = {}): ServerEvent {
  return {
    id,
    server_id: 's1',
    duration_minutes: 120,
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

const a = ev('a', '2026-12-01T20:00:00Z')
const b = ev('b', '2026-12-02T20:00:00Z')
const c = ev('c', '2026-12-03T20:00:00Z')

describe('lista de eventos', () => {
  it('insere mantendo a ordem pela ocorrência mais próxima', () => {
    expect(upsertEvent([a, c], b).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('substitui o evento de mesmo id e reordena se o horário mudou', () => {
    const moved = ev('a', '2026-12-05T20:00:00Z', { title: 'Novo nome' })
    const out = upsertEvent([a, b, c], moved)
    expect(out.map((e) => e.id)).toEqual(['b', 'c', 'a'])
    expect(out[2].title).toBe('Novo nome')
  })

  it('desempata pelo id quando o horário é o mesmo', () => {
    const x = ev('x', '2026-12-01T20:00:00Z')
    expect(upsertEvent([x], a).map((e) => e.id)).toEqual(['a', 'x'])
  })

  it('remove pelo id e ignora id desconhecido', () => {
    expect(removeEvent([a, b], 'a').map((e) => e.id)).toEqual(['b'])
    expect(removeEvent([a, b], 'zzz')).toHaveLength(2)
  })

  it('responder "vou" pela primeira vez soma um', () => {
    const out = applyRsvp([a], 'a', true)
    expect(out[0]).toMatchObject({ my_rsvp: true, going_count: 1 })
  })

  it('trocar de "vou" para "não vou" subtrai um', () => {
    const out = applyRsvp([ev('a', a.next_start_at, { my_rsvp: true, going_count: 3 })], 'a', false)
    expect(out[0]).toMatchObject({ my_rsvp: false, going_count: 2 })
  })

  it('"não vou" sem ter dito "vou" não mexe na contagem', () => {
    expect(applyRsvp([a], 'a', false)[0]).toMatchObject({ my_rsvp: false, going_count: 0 })
  })

  it('tirar a resposta de quem ia subtrai um e volta a sem resposta', () => {
    const out = applyRsvp([ev('a', a.next_start_at, { my_rsvp: true, going_count: 1 })], 'a', null)
    expect(out[0]).toMatchObject({ my_rsvp: null, going_count: 0 })
  })

  it('a contagem nunca fica negativa', () => {
    const out = applyRsvp([ev('a', a.next_start_at, { my_rsvp: true, going_count: 0 })], 'a', null)
    expect(out[0].going_count).toBe(0)
  })

  it('responder a evento que não está na lista devolve a mesma lista', () => {
    const list = [a]
    expect(applyRsvp(list, 'zzz', true)).toBe(list)
  })

  it('setGoingCount troca só a contagem e mantém a minha resposta', () => {
    const out = setGoingCount([ev('a', a.next_start_at, { my_rsvp: true, going_count: 1 })], 'a', 7)
    expect(out[0]).toMatchObject({ my_rsvp: true, going_count: 7 })
  })
})
