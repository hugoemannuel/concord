import { describe, expect, it } from 'vitest'
import { MAX_RAIL_DMS, railDmLabel, unreadRailDms } from './railDms'

type Conv = Parameters<typeof unreadRailDms>[0][number]

const conv = (id: string, at: string, last?: string): Conv => ({
  id,
  updated_at: at,
  last_message: last ? { created_at: last } : undefined
})

describe('unreadRailDms', () => {
  it('só as conversas com mensagem não lida, com a contagem de cada uma', () => {
    const list = [conv('a', '2026-11-01'), conv('b', '2026-11-02'), conv('c', '2026-11-03')]
    const unread = { 'conversation:a': 2, 'conversation:c': 5, 'channel:x': 9 }
    expect(unreadRailDms(list, unread).map((e) => [e.conv.id, e.unread])).toEqual([
      ['c', 5],
      ['a', 2]
    ])
  })

  it('a mensagem mais nova vem primeiro (usa a última mensagem, senão a atualização)', () => {
    const list = [
      conv('velha', '2026-11-05', '2026-11-01T10:00:00Z'),
      conv('nova', '2026-11-01', '2026-11-04T10:00:00Z'),
      conv('sem-msg', '2026-11-03T00:00:00Z')
    ]
    const unread = { 'conversation:velha': 1, 'conversation:nova': 1, 'conversation:sem-msg': 1 }
    expect(unreadRailDms(list, unread).map((e) => e.conv.id)).toEqual(['nova', 'sem-msg', 'velha'])
  })

  it('mostra no máximo MAX_RAIL_DMS (o resto continua no selo do início)', () => {
    const list = Array.from({ length: MAX_RAIL_DMS + 3 }, (_, i) =>
      conv(`c${i}`, `2026-11-0${(i % 9) + 1}`)
    )
    const unread = Object.fromEntries(list.map((c) => [`conversation:${c.id}`, 1]))
    expect(unreadRailDms(list, unread)).toHaveLength(MAX_RAIL_DMS)
  })

  it('nada não lido: lista vazia', () => {
    expect(unreadRailDms([conv('a', '2026-11-01')], { 'conversation:a': 0 })).toEqual([])
  })
})

describe('railDmLabel', () => {
  it('nome e quantas mensagens, no singular e no plural', () => {
    expect(railDmLabel('Ana', 1)).toBe('Ana, 1 mensagem não lida')
    expect(railDmLabel('Ana', 3)).toBe('Ana, 3 mensagens não lidas')
  })
})
