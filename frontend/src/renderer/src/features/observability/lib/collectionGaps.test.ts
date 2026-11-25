import { describe, expect, it } from 'vitest'
import { gapLine } from './collectionGaps'

describe('gapLine', () => {
  it('no mesmo dia: o dia uma vez, a hora do fim e a duração', () => {
    expect(gapLine({ from: '2026-11-23T01:55:00', to: '2026-11-23T10:16:00', minutes: 501 })).toBe(
      '23/11, 01:55 até 10:16 · 8 h 21 min'
    )
  })
  it('virando o dia: as duas datas', () => {
    expect(gapLine({ from: '2026-11-24T23:59:00', to: '2026-11-25T00:15:00', minutes: 16 })).toBe(
      '24/11, 23:59 até 25/11, 00:15 · 16 min'
    )
  })
  it('a coleta ainda não voltou: até agora', () => {
    expect(
      gapLine({ from: '2026-11-25T09:00:00', to: '2026-11-25T09:30:00', minutes: 30, open: true })
    ).toBe('25/11, 09:00 até agora · 30 min')
  })
})
