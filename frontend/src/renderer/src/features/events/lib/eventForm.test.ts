import { describe, expect, it } from 'vitest'
import type { ServerEvent } from '../api/events'
import { DEFAULT_REMINDERS } from './reminders'
import { OTHER_GAME, NO_GAME } from './eventGame'
import { emptyForm, formFromEvent, toInput, type EventFormValues } from './eventForm'

const now = new Date(2026, 10, 1, 12, 0)

function valid(extra: Partial<EventFormValues> = {}): EventFormValues {
  return {
    ...emptyForm(now),
    title: 'Noite de jogos',
    startsAt: '2026-11-04T20:00',
    ...extra
  }
}

const err = (v: EventFormValues): string => {
  const r = toInput(v, now)
  if (r.ok) throw new Error('esperava erro')
  return r.error
}

describe('formulário do evento', () => {
  it('começa com a duração e os lembretes padrão e o início na próxima hora cheia', () => {
    const form = emptyForm(now)
    expect(form.durationMinutes).toBe(120)
    expect(form.reminders).toEqual(DEFAULT_REMINDERS)
    expect(form.startsAt).toBe('2026-11-01T13:00')
    expect(form.recurrence).toBe('none')
  })

  it('monta o pedido do servidor a partir de um formulário válido', () => {
    const r = toInput(valid({ description: '  Traga a galera  ' }), now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.input).toEqual({
      title: 'Noite de jogos',
      description: 'Traga a galera',
      banner_id: null,
      starts_at: new Date(2026, 10, 4, 20, 0).toISOString(),
      duration_minutes: 120,
      game_name: '',
      recurrence: 'none',
      recurrence_until: null,
      recurrence_count: null,
      reminder_offsets: [10, 5]
    })
  })

  it('recusa título vazio ou grande, descrição grande e sem data', () => {
    expect(err(valid({ title: '   ' }))).toBe('Dê um título ao evento.')
    expect(err(valid({ title: 'a'.repeat(101) }))).toBe('O título pode ter até 100 caracteres.')
    expect(err(valid({ description: 'a'.repeat(1001) }))).toBe('A descrição pode ter até 1000 caracteres.')
    expect(err(valid({ startsAt: '' }))).toBe('Escolha a data e a hora de início.')
  })

  it('recusa início no passado', () => {
    expect(err(valid({ startsAt: '2026-11-01T11:59' }))).toBe('O início precisa estar no futuro.')
  })

  it('repete até uma data: vale até o fim desse dia', () => {
    const r = toInput(valid({ recurrence: 'weekly', endMode: 'until', until: '2026-12-01' }), now)
    expect(r.ok && r.input.recurrence_until).toBe(new Date(2026, 11, 1, 23, 59).toISOString())
  })

  it('recusa data final sem preencher ou antes do início', () => {
    expect(err(valid({ recurrence: 'weekly', endMode: 'until', until: '' }))).toBe('Informe até quando o evento repete.')
    expect(err(valid({ recurrence: 'weekly', endMode: 'until', until: '2026-11-03' }))).toBe(
      'A repetição precisa terminar depois do início.'
    )
  })

  it('repete por um número de vezes', () => {
    const r = toInput(valid({ recurrence: 'daily', endMode: 'count', count: '5' }), now)
    expect(r.ok && r.input.recurrence_count).toBe(5)
    expect(err(valid({ recurrence: 'daily', endMode: 'count', count: '0' }))).toBe(
      'Informe quantas vezes repete (1 ou mais).'
    )
    expect(err(valid({ recurrence: 'daily', endMode: 'count', count: '2,5' }))).toBe(
      'Informe quantas vezes repete (1 ou mais).'
    )
  })

  it('sem repetição ignora o que sobrou do fim da repetição', () => {
    const r = toInput(valid({ recurrence: 'none', endMode: 'count', count: '9', until: '2026-12-01' }), now)
    expect(r.ok && [r.input.recurrence_count, r.input.recurrence_until]).toEqual([null, null])
  })

  it('leva a duração escolhida', () => {
    const r = toInput(valid({ durationMinutes: 60 }), now)
    expect(r.ok && r.input.duration_minutes).toBe(60)
  })

  it('leva o banner e os lembretes escolhidos', () => {
    const r = toInput(valid({ bannerId: 'b1', reminders: [30] }), now)
    expect(r.ok && [r.input.banner_id, r.input.reminder_offsets]).toEqual(['b1', [30]])
  })

  it('formFromEvent preenche o formulário de edição', () => {
    const event: ServerEvent = {
      id: 'e1',
      server_id: 's1',
      title: 'Noite',
      description: 'Desc',
      banner_id: 'b1',
      starts_at: new Date(2026, 10, 4, 20, 0).toISOString(),
      next_start_at: new Date(2026, 10, 11, 20, 0).toISOString(),
      duration_minutes: 180,
      game_name: 'Minecraft',
      voice_channel_id: null,
      text_channel_id: null,
      recurrence: 'weekly',
      recurrence_until: new Date(2026, 11, 1, 23, 59).toISOString(),
      recurrence_count: null,
      reminder_offsets: [30],
      created_by: 'u1',
      going_count: 0,
      my_rsvp: null
    }
    expect(formFromEvent(event)).toEqual({
      title: 'Noite',
      description: 'Desc',
      durationMinutes: 180,
      gameChoice: 'Minecraft',
      customGame: '',
      startsAt: '2026-11-04T20:00',
      recurrence: 'weekly',
      endMode: 'until',
      until: '2026-12-01',
      count: '',
      reminders: [30],
      bannerId: 'b1'
    })
    expect(formFromEvent({ ...event, recurrence_until: null, recurrence_count: 4 }).endMode).toBe('count')
    expect(formFromEvent({ ...event, recurrence_until: null }).endMode).toBe('never')
  })

  it('o jogo do catálogo vai pelo nome; "outro" vai pelo texto digitado; "nenhum" vai vazio', () => {
    const named = toInput(valid({ gameChoice: 'VALORANT' }), now)
    expect(named.ok && named.input.game_name).toBe('VALORANT')
    const other = toInput(valid({ gameChoice: OTHER_GAME, customGame: '  Xadrez  ' }), now)
    expect(other.ok && other.input.game_name).toBe('Xadrez')
    const none = toInput(valid({ gameChoice: NO_GAME, customGame: 'sobra' }), now)
    expect(none.ok && none.input.game_name).toBe('')
  })

  it('"Outro jogo…" sem nome e nome grande demais são recusados', () => {
    expect(err(valid({ gameChoice: OTHER_GAME, customGame: '   ' }))).toBe('Digite o nome do jogo.')
    expect(err(valid({ gameChoice: OTHER_GAME, customGame: 'j'.repeat(65) }))).toBe(
      'O nome do jogo pode ter até 64 caracteres.'
    )
  })

  it('formFromEvent abre "Outro jogo…" para jogo fora do catálogo e "nenhum" sem jogo', () => {
    const base = formFromEvent({ ...eventWith('Meu jogo') })
    expect(base.gameChoice).toBe(OTHER_GAME)
    expect(base.customGame).toBe('Meu jogo')
    expect(formFromEvent(eventWith(null)).gameChoice).toBe(NO_GAME)
  })
})

function eventWith(gameName: string | null): ServerEvent {
  return {
    id: 'e1',
    server_id: 's1',
    title: 'Noite',
    description: '',
    banner_id: null,
    starts_at: new Date(2026, 10, 4, 20, 0).toISOString(),
    next_start_at: new Date(2026, 10, 4, 20, 0).toISOString(),
    duration_minutes: 120,
    game_name: gameName,
    voice_channel_id: null,
    text_channel_id: null,
    recurrence: 'none',
    recurrence_until: null,
    recurrence_count: null,
    reminder_offsets: [10, 5],
    created_by: 'u1',
    going_count: 0,
    my_rsvp: null
  }
}
