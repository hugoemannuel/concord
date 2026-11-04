import { describe, expect, it } from 'vitest'
import type { LayoutTree } from './channelLayoutTree'
import {
  autoScrollStep,
  categoryLine,
  channelLine,
  dragPointInList,
  ghostPosition,
  groupHighlighted,
  hoverFromElement,
  peekCandidate,
  pressCanDrag,
  resolveDrop,
  sameHover,
  treeAfterDrop,
  type DropHover,
  type SidebarDrag
} from './sidebarDrop'

const tree: LayoutTree = {
  uncategorized: ['t1', 'v1', 't2'],
  categories: [
    { id: 'a', channels: ['a1', 'a2'] },
    { id: 'b', channels: [] }
  ]
}
const typeOf = (id: string): 'text' | 'voice' => (id.startsWith('v') ? 'voice' : 'text')
const channel = (id: string, categoryId: string | null = null): SidebarDrag => ({
  kind: 'channel',
  id,
  type: typeOf(id),
  categoryId
})
const resolve = (drag: SidebarDrag, hover: DropHover | null) => resolveDrop(tree, drag, hover, typeOf)

describe('soltar canal', () => {
  it('sobre outro canal: antes ou depois, conforme a metade', () => {
    expect(resolve(channel('t1'), { kind: 'channel', id: 'a2', categoryId: 'a', type: 'text', zone: 'before' })).toEqual({ kind: 'channel', categoryId: 'a', beforeId: 'a2', type: 'text' })
    expect(resolve(channel('t1'), { kind: 'channel', id: 'a1', categoryId: 'a', type: 'text', zone: 'after' })).toEqual({ kind: 'channel', categoryId: 'a', beforeId: 'a2', type: 'text' })
    expect(resolve(channel('t1'), { kind: 'channel', id: 'a2', categoryId: 'a', type: 'text', zone: 'after' })).toEqual({ kind: 'channel', categoryId: 'a', beforeId: null, type: 'text' })
  })
  it('sobre a categoria aberta entra em primeiro; recolhida ou vazia, no fim', () => {
    expect(resolve(channel('t1'), { kind: 'category-header', id: 'a', collapsed: false })?.kind).toBe('channel')
    expect(resolve(channel('t1'), { kind: 'category-header', id: 'a', collapsed: false })).toMatchObject({ categoryId: 'a', beforeId: 'a1' })
    expect(resolve(channel('t1'), { kind: 'category-header', id: 'a', collapsed: true })).toMatchObject({ categoryId: 'a', beforeId: null })
    expect(resolve(channel('t1'), { kind: 'category-header', id: 'b', collapsed: false })).toMatchObject({ categoryId: 'b', beforeId: null })
  })
  it('no corpo da categoria vai para o fim', () => {
    expect(resolve(channel('t1'), { kind: 'category-body', id: 'b' })).toMatchObject({ categoryId: 'b', beforeId: null })
  })
  it('para fora: na seção do próprio tipo, mesmo solto na seção do outro', () => {
    expect(resolve(channel('a1', 'a'), { kind: 'section', type: 'voice' })).toEqual({ kind: 'channel', categoryId: null, beforeId: null, type: 'text' })
    const withVoice: LayoutTree = { uncategorized: ['t1'], categories: [{ id: 'a', channels: ['va'] }] }
    expect(resolveDrop(withVoice, channel('va', 'a'), { kind: 'channel', id: 't1', categoryId: null, type: 'text', zone: 'before' }, typeOf)).toEqual({ kind: 'channel', categoryId: null, beforeId: null, type: 'voice' })
  })
  it('na lista sem categoria, "depois" pula o canal do outro tipo', () => {
    expect(resolve(channel('a1', 'a'), { kind: 'channel', id: 't1', categoryId: null, type: 'text', zone: 'after' })).toMatchObject({ categoryId: null, beforeId: 't2' })
  })
  it('sobre si mesmo ou logo ao lado não muda nada', () => {
    expect(resolve(channel('a1', 'a'), { kind: 'channel', id: 'a1', categoryId: 'a', type: 'text', zone: 'after' })).toBeNull()
    expect(resolve(channel('a1', 'a'), { kind: 'channel', id: 'a2', categoryId: 'a', type: 'text', zone: 'before' })).toBeNull()
    expect(resolve(channel('a2', 'a'), { kind: 'category-body', id: 'a' })).toBeNull()
  })
  it('sem categoria, a ordem visível é a do tipo: pular o outro tipo não conta como mudança', () => {
    expect(resolve(channel('t1'), { kind: 'channel', id: 't2', categoryId: null, type: 'text', zone: 'before' })).toBeNull()
    expect(resolve(channel('t2'), { kind: 'section', type: 'text' })).toBeNull()
    expect(resolve(channel('t2'), { kind: 'channel', id: 't1', categoryId: null, type: 'text', zone: 'before' })).toMatchObject({ beforeId: 't1' })
  })
  it('fora de qualquer alvo não solta', () => {
    expect(resolve(channel('t1'), null)).toBeNull()
    expect(resolve(channel('t1'), { kind: 'list' })).toBeNull()
  })
})

describe('soltar categoria', () => {
  const drag: SidebarDrag = { kind: 'category', id: 'a' }
  const dragB: SidebarDrag = { kind: 'category', id: 'b' }
  it('antes ou depois do bloco da outra categoria', () => {
    expect(resolve(dragB, { kind: 'category-block', id: 'a', zone: 'before' })).toEqual({ kind: 'category', beforeId: 'a' })
    expect(resolve(drag, { kind: 'category-block', id: 'b', zone: 'after' })).toEqual({ kind: 'category', beforeId: null })
  })
  it('sobre a lista sem categoria vai para o começo', () => {
    expect(resolve(dragB, { kind: 'section', type: 'text' })).toEqual({ kind: 'category', beforeId: 'a' })
  })
  it('no espaço abaixo de tudo vai para o fim', () => {
    expect(resolve(drag, { kind: 'list' })).toEqual({ kind: 'category', beforeId: null })
  })
  it('sobre o próprio lugar não muda nada', () => {
    expect(resolve(drag, { kind: 'category-block', id: 'a', zone: 'after' })).toBeNull()
    expect(resolve(drag, { kind: 'category-block', id: 'b', zone: 'before' })).toBeNull()
    expect(resolve(drag, { kind: 'section', type: 'voice' })).toBeNull()
    expect(resolve(drag, null)).toBeNull()
  })
})

describe('indicadores', () => {
  it('linha do canal: acima do alvo ou abaixo do último do grupo', () => {
    const target = { kind: 'channel', categoryId: 'a', beforeId: 'a2', type: 'text' } as const
    expect(channelLine(target, 'a2', 'text', 'a', false)).toBe('before')
    expect(channelLine(target, 'a1', 'text', 'a', false)).toBeNull()
    const end = { ...target, beforeId: null }
    expect(channelLine(end, 'a2', 'text', 'a', true)).toBe('after')
    expect(channelLine(end, 'a1', 'text', 'a', false)).toBeNull()
    expect(channelLine(end, 'b1', 'text', 'b', true)).toBeNull()
    expect(channelLine(null, 'a1', 'text', 'a', true)).toBeNull()
    expect(channelLine({ kind: 'category', beforeId: null }, 'a1', 'text', 'a', true)).toBeNull()
  })
  it('sem categoria, a linha do fim só aparece na seção do tipo do canal', () => {
    const end = { kind: 'channel', categoryId: null, beforeId: null, type: 'voice' } as const
    expect(channelLine(end, 't2', 'text', null, true)).toBeNull()
    expect(channelLine(end, 'v1', 'voice', null, true)).toBe('after')
  })
  it('linha da categoria', () => {
    expect(categoryLine({ kind: 'category', beforeId: 'b' }, 'b', true)).toBe('before')
    expect(categoryLine({ kind: 'category', beforeId: null }, 'b', true)).toBe('after')
    expect(categoryLine({ kind: 'category', beforeId: null }, 'a', false)).toBeNull()
    expect(categoryLine({ kind: 'channel', categoryId: 'a', beforeId: null, type: 'text' }, 'a', true)).toBeNull()
    expect(categoryLine(null, 'a', true)).toBeNull()
  })
  it('realce do grupo de destino', () => {
    const target = { kind: 'channel', categoryId: 'a', beforeId: null, type: 'text' } as const
    expect(groupHighlighted(target, 'a')).toBe(true)
    expect(groupHighlighted(target, 'b')).toBe(false)
    expect(groupHighlighted(null, 'a')).toBe(false)
    expect(groupHighlighted({ kind: 'channel', categoryId: null, beforeId: null, type: 'voice' }, null, 'voice')).toBe(true)
    expect(groupHighlighted({ kind: 'channel', categoryId: null, beforeId: null, type: 'voice' }, null, 'text')).toBe(false)
  })
})

describe('sameHover', () => {
  it('compara pelo conteúdo', () => {
    expect(sameHover({ kind: 'list' }, { kind: 'list' })).toBe(true)
    expect(sameHover(null, null)).toBe(true)
    expect(sameHover(null, { kind: 'list' })).toBe(false)
    expect(sameHover({ kind: 'category-body', id: 'a' }, { kind: 'category-body', id: 'b' })).toBe(false)
  })
})

describe('autoScrollStep', () => {
  it('rola perto das bordas, mais rápido quanto mais perto', () => {
    expect(autoScrollStep(150, 100, 500)).toBeLessThan(0)
    expect(autoScrollStep(101, 100, 500)).toBeLessThan(autoScrollStep(140, 100, 500))
    expect(autoScrollStep(490, 100, 500)).toBeGreaterThan(0)
    expect(autoScrollStep(300, 100, 500)).toBe(0)
  })
  it('fora da lista continua no limite', () => {
    expect(autoScrollStep(50, 100, 500)).toBe(autoScrollStep(100, 100, 500))
    expect(autoScrollStep(600, 100, 500)).toBe(autoScrollStep(500, 100, 500))
  })
})

function element(data: Record<string, string>, top = 0, height = 100, parent: Record<string, unknown> = {}): Element {
  const self = {
    dataset: data,
    getBoundingClientRect: () => ({ top, height }),
    closest: (selector: string) => {
      const key = selector.match(/data-dnd="([a-z-]+)"/)?.[1]
      if (key && data.dnd === key) return self
      return (parent as { closest?: (s: string) => unknown }).closest?.(selector) ?? null
    }
  }
  return self as unknown as Element
}

describe('hoverFromElement', () => {
  const row = (top = 0): Element => element({ dnd: 'channel', id: 'c', type: 'voice', category: 'a' }, top, 100)
  it('canal: metade de cima é antes, de baixo é depois', () => {
    expect(hoverFromElement(row(), 20, 'channel')).toEqual({ kind: 'channel', id: 'c', type: 'voice', categoryId: 'a', zone: 'before' })
    expect(hoverFromElement(row(), 80, 'channel')).toMatchObject({ zone: 'after' })
  })
  it('canal sem categoria', () => {
    expect(hoverFromElement(element({ dnd: 'channel', id: 'c', type: 'text' }), 1, 'channel')).toMatchObject({ categoryId: null })
  })
  it('arrastando canal: cabeçalho, corpo, seção e lista', () => {
    expect(hoverFromElement(element({ dnd: 'category-header', id: 'a', collapsed: 'true' }), 0, 'channel')).toEqual({ kind: 'category-header', id: 'a', collapsed: true })
    expect(hoverFromElement(element({ dnd: 'category-block', id: 'a' }), 0, 'channel')).toEqual({ kind: 'category-body', id: 'a' })
    expect(hoverFromElement(element({ dnd: 'section', type: 'voice' }), 0, 'channel')).toEqual({ kind: 'section', type: 'voice' })
    expect(hoverFromElement(element({ dnd: 'list' }), 0, 'channel')).toEqual({ kind: 'list' })
  })
  it('arrastando categoria: vale o bloco inteiro, mesmo por cima de um canal', () => {
    const block = element({ dnd: 'category-block', id: 'a' }, 0, 200)
    const inner = element({ dnd: 'channel', id: 'c', type: 'text' }, 0, 10, block as unknown as Record<string, unknown>)
    expect(hoverFromElement(inner, 150, 'category')).toEqual({ kind: 'category-block', id: 'a', zone: 'after' })
    expect(hoverFromElement(inner, 50, 'category')).toEqual({ kind: 'category-block', id: 'a', zone: 'before' })
  })
  it('fora da lista não é alvo', () => {
    expect(hoverFromElement(element({}), 0, 'channel')).toBeNull()
    expect(hoverFromElement(null, 0, 'category')).toBeNull()
  })
})

describe('treeAfterDrop', () => {
  it('aplica a categoria movida ou o canal movido', () => {
    expect(treeAfterDrop(tree, { kind: 'category', id: 'b' }, { kind: 'category', beforeId: 'a' }).categories[0].id).toBe('b')
    expect(treeAfterDrop(tree, channel('t1'), { kind: 'channel', categoryId: 'b', beforeId: null, type: 'text' }).categories[1].channels).toEqual(['t1'])
  })
  it('alvo de outro tipo não muda nada', () => {
    expect(treeAfterDrop(tree, channel('t1'), { kind: 'category', beforeId: 'a' })).toEqual(tree)
    expect(treeAfterDrop(tree, { kind: 'category', id: 'b' }, { kind: 'channel', categoryId: 'b', beforeId: null, type: 'text' })).toEqual(tree)
  })
})

describe('peekCandidate', () => {
  it('só categoria recolhida, e só arrastando canal', () => {
    expect(peekCandidate(channel('t1'), { kind: 'category-header', id: 'a', collapsed: true })).toBe('a')
    expect(peekCandidate(channel('t1'), { kind: 'category-header', id: 'a', collapsed: false })).toBeNull()
    expect(peekCandidate({ kind: 'category', id: 'b' }, { kind: 'category-header', id: 'a', collapsed: true })).toBeNull()
    expect(peekCandidate(channel('t1'), null)).toBeNull()
  })
})

describe('pressCanDrag', () => {
  const target = (blocked: boolean): Element => ({ closest: () => (blocked ? {} : null) }) as unknown as Element
  it('só o botão principal, fora de controles', () => {
    expect(pressCanDrag(0, target(false))).toBe(true)
    expect(pressCanDrag(2, target(false))).toBe(false)
    expect(pressCanDrag(0, target(true))).toBe(false)
  })
})

describe('dragPointInList', () => {
  const rect = { left: 100, right: 300, top: 50, bottom: 450 }
  it('traz o ponto para dentro da lista: as margens continuam valendo', () => {
    expect(dragPointInList(101, 20, rect)).toEqual({ x: 116, y: 51 })
    expect(dragPointInList(299, 500, rect)).toEqual({ x: 284, y: 449 })
    expect(dragPointInList(200, 200, rect)).toEqual({ x: 200, y: 200 })
  })
  it('longe da lista não é alvo', () => {
    expect(dragPointInList(600, 200, rect)).toBeNull()
    expect(dragPointInList(10, 200, rect)).toBeNull()
  })
})

describe('ghostPosition', () => {
  it('fica ao lado do ponteiro', () => {
    expect(ghostPosition({ x: 100, y: 200 }, 224, 1280)).toEqual({ x: 112, y: 184 })
  })
  it('em tela estreita não passa da borda direita', () => {
    expect(ghostPosition({ x: 300, y: 200 }, 224, 360)).toEqual({ x: 128, y: 184 })
  })
  it('nunca sai pela esquerda', () => {
    expect(ghostPosition({ x: 10, y: 200 }, 500, 360)).toEqual({ x: 8, y: 184 })
  })
})
