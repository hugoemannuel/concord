import { describe, expect, it } from 'vitest'
import { channelsWithPlacement, categoryMenuMove } from './categoryLayout'

describe('organização dos canais', () => {
  it('aplica posições sem perder canais ainda ausentes do layout', () => {
    const channels = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(channelsWithPlacement(channels, [
      { channel_id: 'b', category_id: 'x', position: 1 },
      { channel_id: 'a', category_id: 'x', position: 0 }
    ])).toEqual([
      { id: 'a', category_id: 'x', synced: true }, { id: 'b', category_id: 'x', synced: true }, { id: 'c', category_id: null, synced: true }
    ])
  })
  it('o que o servidor diz sobre estar vinculado acompanha o canal', () => {
    expect(channelsWithPlacement([{ id: 'a' }], [{ channel_id: 'a', category_id: 'x', position: 0, synced: false }])).toEqual([{ id: 'a', category_id: 'x', synced: false }])
  })
  it('o menu move entre vizinhos, de qualquer tipo', () => {
    const group = [{ id: 'a', category_id: 'cat' }, { id: 'voz', category_id: 'cat' }, { id: 'b', category_id: 'cat' }]
    expect(categoryMenuMove(group, 0, 1)).toEqual({ channel: 'a', category: 'cat', before: 'b' })
    expect(categoryMenuMove(group, 2, 1)).toEqual({ channel: 'b', category: 'cat', before: 'voz' })
    expect(categoryMenuMove(group, 1, 2)).toEqual({ channel: 'voz', category: 'cat', before: null })
    expect(categoryMenuMove(group, 0, -1)).toBeNull()
  })
})
