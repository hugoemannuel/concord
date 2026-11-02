import { describe, expect, it } from 'vitest'
import { channelsWithPlacement, nextChannelAfterMove, categoryMenuMove, validCategoryDrag } from './categoryLayout'

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
  it('calcula o próximo canal para mover para cima ou para baixo', () => {
    const ids = ['a', 'b', 'c']
    expect(nextChannelAfterMove(ids, 0, 1)).toBe('c')
    expect(nextChannelAfterMove(ids, 2, 0)).toBe('a')
    expect(nextChannelAfterMove(ids, 1, 2)).toBeNull()
  })
  it('move pelo menu entre canais do mesmo tipo sem perder os demais tipos', () => {
    const group = [{ id: 'a', category_id: 'cat' }, { id: 'voz', category_id: 'cat' }, { id: 'b', category_id: 'cat' }]
    expect(categoryMenuMove(group, [group[0], group[2]], 0, 1)).toEqual({ channel: 'a', category: 'cat', before: null })
    expect(categoryMenuMove(group, [group[0], group[2]], 1, 0)).toEqual({ channel: 'b', category: 'cat', before: 'a' })
    expect(categoryMenuMove(group, [group[0]], 0, 3)).toBeNull()
  })
  it('ignora arrastos externos e o próprio alvo', () => {
    expect(validCategoryDrag('a', 'b', [{ id: 'a' }])).toBe(true)
    expect(validCategoryDrag('a', 'a', [{ id: 'a' }])).toBe(false)
    expect(validCategoryDrag('x', null, [{ id: 'a' }])).toBe(false)
  })
})
