import { describe, expect, it } from 'vitest'
import { timeLabel } from './timeLabel'

describe('timeLabel', () => {
  it('mostra dia, mês e horário local sem ano', () => {
    expect(timeLabel('2026-01-02T03:04:00')).toBe('02/01, 03:04')
  })

  it('preserva o resultado nativo de uma data inválida', () => {
    expect(timeLabel('inválida')).toBe('Invalid Date')
  })
})
