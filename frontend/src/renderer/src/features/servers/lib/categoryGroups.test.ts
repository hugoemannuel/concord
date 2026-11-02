import { describe, expect, it } from 'vitest'
import { groupChannelsByCategory } from './categoryGroups'

describe('groupChannelsByCategory', () => {
  it('agrupa canais de texto e voz e preserva a ordem recebida', () => {
    const categories = [{ id: 'a' }, { id: 'b' }]
    const channels = [
      { id: '1', category_id: 'a', type: 'text' },
      { id: '2', category_id: null, type: 'voice' },
      { id: '3', category_id: 'a', type: 'voice' }
    ]
    expect(groupChannelsByCategory(categories, channels)).toEqual({
      uncategorized: [channels[1]],
      groups: [
        { category: categories[0], channels: [channels[0], channels[2]] },
        { category: categories[1], channels: [] }
      ]
    })
  })

  it('mantém visíveis canais cuja categoria ainda não foi carregada', () => {
    const channel = { id: '1', category_id: 'ausente' }
    expect(groupChannelsByCategory([], [channel])).toEqual({ uncategorized: [channel], groups: [] })
  })
})
