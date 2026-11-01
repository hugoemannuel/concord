import { describe, expect, it } from 'vitest'
import { COALESCE_MS, HISTORY_LIMIT, record, redo, startHistory, undo } from './editHistory'

describe('editHistory', () => {
  it('desfaz e refaz', () => {
    let h = startHistory('a')
    h = record(h, 'b', 'cor', 0)
    h = record(h, 'c', 'nome', 10)
    h = undo(h)
    expect(h.present).toBe('b')
    h = undo(h)
    expect(h.present).toBe('a')
    expect(undo(h)).toBe(h)
    h = redo(h)
    expect(h.present).toBe('b')
    h = redo(redo(h))
    expect(h.present).toBe('c')
  })

  it('arrastar a mesma cor vira um passo só', () => {
    let h = startHistory('a')
    h = record(h, 'b', 'cor', 0)
    h = record(h, 'c', 'cor', 100)
    h = record(h, 'd', 'cor', 200)
    expect(undo(h).present).toBe('a')
    h = record(h, 'e', 'cor', 200 + COALESCE_MS)
    expect(undo(h).present).toBe('d')
  })

  it('mudança nova apaga o refazer e o passado tem limite', () => {
    let h = record(startHistory(0), 1, 'x', 0)
    h = record(undo(h), 2, 'x', 1000)
    expect(h.future).toEqual([])
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = record(h, i, `k${i}`, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
  })
})
