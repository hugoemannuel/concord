import { describe, expect, it } from 'vitest'
import { rankUses, recordUse } from './frecency'

const DAY = 24 * 60 * 60 * 1000

describe('recordUse', () => {
  it('conta os usos e guarda o último', () => {
    const once = recordUse({}, 'a', 1000)
    expect(once.a).toEqual({ count: 1, last: 1000 })
    expect(recordUse(once, 'a', 2000).a).toEqual({ count: 2, last: 2000 })
  })

  it('não cresce sem fim: sai o mais antigo', () => {
    let map = recordUse({}, 'velho', 1)
    map = recordUse(map, 'b', 2)
    map = recordUse(map, 'c', 3, 2)
    expect(Object.keys(map).sort()).toEqual(['b', 'c'])
  })
})

describe('rankUses', () => {
  it('quem foi mais usado vem primeiro', () => {
    const map = { a: { count: 1, last: 0 }, b: { count: 5, last: 0 } }
    expect(rankUses(map, 0)).toEqual(['b', 'a'])
  })

  it('o uso recente pesa mais que muitos usos antigos', () => {
    const map = { antigo: { count: 10, last: 0 }, novo: { count: 3, last: 60 * DAY } }
    expect(rankUses(map, 60 * DAY)).toEqual(['novo', 'antigo'])
  })

  it('emoji de qualquer servidor entra igual', () => {
    expect(rankUses(recordUse({}, 'custom:id-de-outro-servidor', 1), 1)).toEqual(['custom:id-de-outro-servidor'])
  })
})
