import { describe, expect, it } from 'vitest'
import { RECURRENCE_OPTIONS, recurrenceLabel } from './recurrence'

// 4/11/2026 é uma quarta-feira; 7/11/2026, um sábado.
const wednesday = new Date(2026, 10, 4, 20, 0)
const saturday = new Date(2026, 10, 7, 20, 0)

describe('rótulo da repetição', () => {
  it('não repete', () => {
    expect(recurrenceLabel('none', wednesday)).toBe('Não repete')
  })

  it('todo dia', () => {
    expect(recurrenceLabel('daily', wednesday)).toBe('Todo dia')
  })

  it('toda semana concorda com o gênero do dia', () => {
    expect(recurrenceLabel('weekly', wednesday)).toBe('Toda quarta-feira')
    expect(recurrenceLabel('weekly', saturday)).toBe('Todo sábado')
  })

  it('todo mês usa o dia do início', () => {
    expect(recurrenceLabel('monthly', new Date(2026, 10, 15, 20, 0))).toBe('Todo dia 15 do mês')
  })

  it('dia 29 a 31 avisa que o mês curto usa o último dia', () => {
    expect(recurrenceLabel('monthly', new Date(2026, 9, 31, 20, 0))).toContain('último dia')
    expect(recurrenceLabel('monthly', new Date(2026, 10, 28, 20, 0))).not.toContain('último dia')
  })

  it('oferece as quatro regras na ordem do formulário', () => {
    expect(RECURRENCE_OPTIONS.map((o) => o.value)).toEqual(['none', 'daily', 'weekly', 'monthly'])
  })
})
