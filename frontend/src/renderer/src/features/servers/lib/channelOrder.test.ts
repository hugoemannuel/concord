import { describe, expect, it } from 'vitest'
import {
  applyChannelOrder,
  insertionToTarget,
  moveItem
} from './channelOrder'

describe('moveItem', () => {
  it('move um item do índice i para o j', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 1)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('não muda a lista original', () => {
    const list = ['a', 'b', 'c']
    moveItem(list, 0, 2)
    expect(list).toEqual(['a', 'b', 'c'])
  })

  it('índices fora da lista são limitados', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 7, 0)).toEqual(['a', 'b', 'c'])
  })
})

describe('insertionToTarget', () => {
  it('linha entre itens vira o índice final do item arrastado', () => {
    // arrastando "a" (0) para depois de "c" (linha 3) → índice 2
    expect(insertionToTarget(0, 3)).toBe(2)
    // arrastando "d" (3) para antes de "b" (linha 1) → índice 1
    expect(insertionToTarget(3, 1)).toBe(1)
    expect(moveItem(['a', 'b', 'c', 'd'], 0, insertionToTarget(0, 3))).toEqual(['b', 'c', 'a', 'd'])
  })

})

describe('applyChannelOrder', () => {
  const channels = [
    { id: 't1', type: 'text' },
    { id: 'v1', type: 'voice' },
    { id: 't2', type: 'text' },
    { id: 'v2', type: 'voice' },
    { id: 't3', type: 'text' }
  ] as const

  it('reordena só os canais daquele tipo, sem mexer nos outros', () => {
    const r = applyChannelOrder([...channels], 'text', ['t3', 't1', 't2'])
    expect(r.filter((c) => c.type === 'text').map((c) => c.id)).toEqual(['t3', 't1', 't2'])
    expect(r.filter((c) => c.type === 'voice').map((c) => c.id)).toEqual(['v1', 'v2'])
    expect(r).toHaveLength(5)
  })

  it('canal que não está na lista (criado agora) fica no fim da seção', () => {
    const r = applyChannelOrder([...channels], 'text', ['t2', 't1'])
    expect(r.filter((c) => c.type === 'text').map((c) => c.id)).toEqual(['t2', 't1', 't3'])
  })

  it('mesma ordem devolve a mesma lista (sem re-render à toa)', () => {
    const list = [...channels]
    expect(applyChannelOrder(list, 'voice', ['v1', 'v2'])).toBe(list)
  })

  it('tipo ausente conta como texto (canais antigos)', () => {
    const r = applyChannelOrder(
      [{ id: 'a' }, { id: 'b', type: 'voice' }, { id: 'c', type: 'text' }],
      'text',
      ['c', 'a']
    )
    expect(r.map((c) => c.id)).toEqual(['c', 'b', 'a'])
  })
})
