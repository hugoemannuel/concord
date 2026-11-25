import { describe, expect, it } from 'vitest'
import type { LiveReport, WorstRow } from '../api/observability'
import { splitWorst, worstLists } from './worstByKind'

const row = (id: string, kind: string): WorstRow => ({ id, kind }) as WorstRow

describe('splitWorst', () => {
  it('separa a voz das calls das lives (quem transmite e quem assiste), na mesma ordem', () => {
    const rows = [row('1', 'call'), row('2', 'assiste'), row('3', 'transmite'), row('4', 'call')]
    const { lives, calls } = splitWorst(rows)
    expect(lives.map((r) => r.id)).toEqual(['2', '3'])
    expect(calls.map((r) => r.id)).toEqual(['1', '4'])
  })
  it('lista vazia: as duas vazias', () => {
    expect(splitWorst([])).toEqual({ lives: [], calls: [] })
  })
})

describe('worstLists', () => {
  it('usa as duas listas do backend (cada uma com o seu teto)', () => {
    const report = {
      worst: [row('1', 'call'), row('2', 'assiste')],
      worst_lives: [row('2', 'assiste')],
      worst_calls: [row('1', 'call')]
    } as LiveReport
    expect(worstLists(report)).toEqual({ lives: [row('2', 'assiste')], calls: [row('1', 'call')] })
  })
  it('backend de antes (só worst): separa por tipo', () => {
    const report = { worst: [row('1', 'call'), row('2', 'transmite')] } as LiveReport
    expect(worstLists(report).calls.map((r) => r.id)).toEqual(['1'])
    expect(worstLists(report).lives.map((r) => r.id)).toEqual(['2'])
  })
})
