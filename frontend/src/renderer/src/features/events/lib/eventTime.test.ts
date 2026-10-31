import { describe, expect, it } from 'vitest'
import { endTimeLabel, formatWhen, fromLocalInput, toLocalInput } from './eventTime'

// Tudo em horário local do aparelho, como o <input type="datetime-local">.
const local = new Date(2026, 10, 4, 20, 30)

describe('datas do evento', () => {
  it('toLocalInput devolve o horário local no formato do campo', () => {
    expect(toLocalInput(local.toISOString())).toBe('2026-11-04T20:30')
  })

  it('fromLocalInput volta ao instante certo (ISO)', () => {
    expect(fromLocalInput('2026-11-04T20:30')).toBe(local.toISOString())
  })

  it('fromLocalInput recusa campo vazio ou inválido', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('amanhã')).toBeNull()
  })

  it('o caminho de ida e volta não muda o instante', () => {
    const iso = local.toISOString()
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
  })

  it('formatWhen mostra dia, mês e hora', () => {
    const text = formatWhen(local.toISOString())
    expect(text).toContain('20:30')
    expect(text).toContain('4')
  })

  it('endTimeLabel mostra a hora em que a sala fecha', () => {
    expect(endTimeLabel(local.toISOString(), 120)).toBe('22:30')
    expect(endTimeLabel(local.toISOString(), 30)).toBe('21:00')
  })
})
