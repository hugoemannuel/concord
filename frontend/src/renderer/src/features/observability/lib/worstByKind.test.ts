import { describe, expect, it } from 'vitest'
import type { WorstRow } from '../api/observability'
import { splitWorst } from './worstByKind'

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
