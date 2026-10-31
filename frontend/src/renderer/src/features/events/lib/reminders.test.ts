import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REMINDERS,
  MAX_REMINDERS,
  REMINDER_OPTIONS,
  canPickReminder,
  toggleReminder
} from './reminders'

describe('lembretes do evento', () => {
  it('oferece as seis antecedências do servidor, da maior para a menor', () => {
    expect(REMINDER_OPTIONS.map((o) => o.minutes)).toEqual([1440, 60, 30, 15, 10, 5])
  })

  it('o padrão é 10 e 5 minutos e o limite é 2', () => {
    expect(DEFAULT_REMINDERS).toEqual([10, 5])
    expect(MAX_REMINDERS).toBe(2)
  })

  it('marca uma antecedência nova mantendo a lista do maior para o menor', () => {
    expect(toggleReminder([10], 5)).toEqual([10, 5])
    expect(toggleReminder([5], 30)).toEqual([30, 5])
  })

  it('desmarca uma antecedência marcada', () => {
    expect(toggleReminder([10, 5], 10)).toEqual([5])
  })

  it('não deixa marcar uma terceira', () => {
    expect(toggleReminder([10, 5], 30)).toEqual([10, 5])
  })

  it('canPickReminder: desmarcar sempre pode; marcar só até o limite', () => {
    expect(canPickReminder([10, 5], 10)).toBe(true)
    expect(canPickReminder([10, 5], 30)).toBe(false)
    expect(canPickReminder([10], 30)).toBe(true)
    expect(canPickReminder([], 1440)).toBe(true)
  })
})
