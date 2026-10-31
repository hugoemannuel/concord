import { describe, expect, it } from 'vitest'
import { DEFAULT_DURATION, DURATION_OPTIONS, durationLabel } from './duration'

describe('duração do evento', () => {
  it('oferece as mesmas cinco durações do servidor e o padrão de 2 horas', () => {
    expect(DURATION_OPTIONS.map((o) => o.minutes)).toEqual([30, 60, 120, 180, 240])
    expect(DEFAULT_DURATION).toBe(120)
  })

  it('o padrão está entre as opções', () => {
    expect(DURATION_OPTIONS.some((o) => o.minutes === DEFAULT_DURATION)).toBe(true)
  })

  it('durationLabel escreve a duração por extenso', () => {
    expect(durationLabel(30)).toBe('30 minutos')
    expect(durationLabel(60)).toBe('1 hora')
    expect(durationLabel(120)).toBe('2 horas')
    expect(durationLabel(240)).toBe('4 horas')
  })
})
