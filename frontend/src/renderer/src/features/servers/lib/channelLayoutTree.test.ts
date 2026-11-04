import { describe, expect, it } from 'vitest'
import {
  applyTreeToLayout,
  buildLayoutTree,
  categoryStepBefore,
  moveCategoryInTree,
  moveChannelInTree,
  treeToLayoutWrite,
  type LayoutTree
} from './channelLayoutTree'

const tree: LayoutTree = {
  uncategorized: ['livre', 'voz'],
  categories: [
    { id: 'a', channels: ['a1', 'a2'] },
    { id: 'b', channels: ['b1'] },
    { id: 'vazia', channels: [] }
  ]
}

describe('mover categoria', () => {
  it('leva os canais junto', () => {
    expect(moveCategoryInTree(tree, 'a', 'vazia').categories).toEqual([
      { id: 'b', channels: ['b1'] },
      { id: 'a', channels: ['a1', 'a2'] },
      { id: 'vazia', channels: [] }
    ])
  })
  it('para o fim, com alvo nulo', () => {
    expect(moveCategoryInTree(tree, 'a', null).categories.map((c) => c.id)).toEqual(['b', 'vazia', 'a'])
  })
  it('para o começo', () => {
    expect(moveCategoryInTree(tree, 'vazia', 'a').categories.map((c) => c.id)).toEqual(['vazia', 'a', 'b'])
  })
  it('não muda nada com categoria ou alvo desconhecidos', () => {
    expect(moveCategoryInTree(tree, 'x', 'a')).toEqual(tree)
    expect(moveCategoryInTree(tree, 'a', 'x')).toEqual(tree)
  })
  it('não muda a árvore de entrada', () => {
    moveCategoryInTree(tree, 'a', null)
    expect(tree.categories[0].id).toBe('a')
  })
  it('calcula o alvo de subir e descer pelo menu', () => {
    expect(categoryStepBefore(tree, 'b', 'up')).toEqual({ ok: true, before: 'a' })
    expect(categoryStepBefore(tree, 'a', 'down')).toEqual({ ok: true, before: 'vazia' })
    expect(categoryStepBefore(tree, 'b', 'down')).toEqual({ ok: true, before: null })
    expect(categoryStepBefore(tree, 'a', 'up')).toEqual({ ok: false })
    expect(categoryStepBefore(tree, 'vazia', 'down')).toEqual({ ok: false })
  })
})

describe('mover canal', () => {
  it('dentro da categoria', () => {
    expect(moveChannelInTree(tree, 'a2', 'a', 'a1').categories[0].channels).toEqual(['a2', 'a1'])
  })
  it('entre categorias, antes de um alvo', () => {
    const next = moveChannelInTree(tree, 'a1', 'b', 'b1')
    expect(next.categories[0].channels).toEqual(['a2'])
    expect(next.categories[1].channels).toEqual(['a1', 'b1'])
  })
  it('para uma categoria vazia', () => {
    expect(moveChannelInTree(tree, 'b1', 'vazia', null).categories[2].channels).toEqual(['b1'])
  })
  it('para fora de qualquer categoria', () => {
    const next = moveChannelInTree(tree, 'a1', null, null)
    expect(next.uncategorized).toEqual(['livre', 'voz', 'a1'])
    expect(next.categories[0].channels).toEqual(['a2'])
  })
  it('de fora para dentro', () => {
    const next = moveChannelInTree(tree, 'voz', 'a', 'a2')
    expect(next.uncategorized).toEqual(['livre'])
    expect(next.categories[0].channels).toEqual(['a1', 'voz', 'a2'])
  })
  it('não some com o canal nem aceita destino desconhecido', () => {
    expect(moveChannelInTree(tree, 'x', 'a', null)).toEqual(tree)
    expect(moveChannelInTree(tree, 'a1', 'x', null)).toEqual(tree)
  })
  it('alvo que não está no destino vai para o fim', () => {
    expect(moveChannelInTree(tree, 'a1', 'b', 'nao-existe').categories[1].channels).toEqual(['b1', 'a1'])
  })
})

describe('árvore e gravação', () => {
  const categories = [{ id: 'a', name: 'A', position: 0 }, { id: 'b', name: 'B', position: 1 }]
  it('monta a partir das categorias e dos canais, na ordem recebida', () => {
    expect(buildLayoutTree(categories, [
      { id: '1', category_id: 'b' },
      { id: '2', category_id: null },
      { id: '3', category_id: 'b' },
      { id: '4', category_id: 'sumiu' }
    ])).toEqual({
      uncategorized: ['2', '4'],
      categories: [{ id: 'a', channels: [] }, { id: 'b', channels: ['1', '3'] }]
    })
  })
  it('vira o pedido de gravação, com posição por grupo', () => {
    expect(treeToLayoutWrite({ uncategorized: ['l'], categories: [{ id: 'b', channels: ['x', 'y'] }, { id: 'a', channels: [] }] })).toEqual({
      categories: ['b', 'a'],
      channels: [
        { channel_id: 'l', category_id: null, position: 0 },
        { channel_id: 'x', category_id: 'b', position: 0 },
        { channel_id: 'y', category_id: 'b', position: 1 }
      ]
    })
  })
  it('atualização otimista: reordena categorias e canais sem perder nomes', () => {
    const next = applyTreeToLayout(
      { categories, channels: [], revision: 'r' },
      { uncategorized: ['l'], categories: [{ id: 'b', channels: ['x'] }, { id: 'a', channels: [] }] }
    )
    expect(next.categories).toEqual([{ id: 'b', name: 'B', position: 0 }, { id: 'a', name: 'A', position: 1 }])
    expect(next.channels).toEqual([
      { channel_id: 'l', category_id: null, position: 0 },
      { channel_id: 'x', category_id: 'b', position: 0 }
    ])
    expect(next.revision).toBe('r')
  })
})
