import { describe, expect, it } from 'vitest'
import { channelsWithPlacement, categoryMenuMove } from './categoryLayout'

describe('organização dos canais', () => {
  it('aplica posições sem perder canais ainda ausentes do layout', () => {
    const channels = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(channelsWithPlacement(channels, [
      { channel_id: 'b', category_id: 'x', position: 1 },
      { channel_id: 'a', category_id: 'x', position: 0 }
    ])).toEqual([
      { id: 'a', category_id: 'x' }, { id: 'b', category_id: 'x' }, { id: 'c', category_id: null }
    ])
  })
  it('move pelo menu entre canais do mesmo tipo sem perder os demais tipos', () => {
    const group = [{ id: 'a', category_id: 'cat' }, { id: 'voz', category_id: 'cat' }, { id: 'b', category_id: 'cat' }]
    expect(categoryMenuMove(group, [group[0], group[2]], 0, 1)).toEqual({ channel: 'a', category: 'cat', before: null })
    expect(categoryMenuMove(group, [group[0], group[2]], 1, 0)).toEqual({ channel: 'b', category: 'cat', before: 'a' })
    expect(categoryMenuMove(group, [group[0]], 0, 3)).toBeNull()
  })
})
