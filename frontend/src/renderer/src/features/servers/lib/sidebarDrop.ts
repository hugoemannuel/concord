// Arrastar na barra de canais: o que está sob o ponteiro (DropHover), onde o
// item cairia (DropTarget) e os indicadores. Puro: o gesto em si fica em
// sidebarDragGesture e o hook useSidebarDrag liga os dois.
import type { ChannelType } from '../api/channels'
import { moveCategoryInTree, moveChannelInTree, type LayoutTree } from './channelLayoutTree'

export type DropZone = 'before' | 'after'
export type DropLineSide = DropZone | null

export type SidebarDrag =
  | { kind: 'channel'; id: string; type: ChannelType; categoryId: string | null }
  | { kind: 'category'; id: string }

export type DropHover =
  | { kind: 'channel'; id: string; type: ChannelType; categoryId: string | null; zone: DropZone }
  | { kind: 'category-header'; id: string; collapsed: boolean }
  | { kind: 'category-body'; id: string }
  | { kind: 'category-block'; id: string; zone: DropZone }
  | { kind: 'section'; type: ChannelType }
  | { kind: 'list' }

export type DropTarget =
  | { kind: 'channel'; categoryId: string | null; beforeId: string | null; type: ChannelType }
  | { kind: 'category'; beforeId: string | null }

type TypeOf = (id: string) => ChannelType
type ChannelDrag = Extract<SidebarDrag, { kind: 'channel' }>
type ChannelHover = Extract<DropHover, { kind: 'channel' }>
type Spot = { categoryId: string | null; beforeId: string | null }

/** Vizinhos visíveis do canal arrastado no grupo: sem categoria, cada tipo tem a sua seção. */
function peersIn(tree: LayoutTree, categoryId: string | null, drag: ChannelDrag, typeOf: TypeOf): string[] {
  const ids = categoryId === null
    ? tree.uncategorized.filter((id) => typeOf(id) === drag.type)
    : tree.categories.find((category) => category.id === categoryId)?.channels ?? []
  return ids.filter((id) => id !== drag.id)
}

function spotOverChannel(hover: ChannelHover, peers: string[], drag: ChannelDrag): Spot {
  if (hover.categoryId === null && hover.type !== drag.type) return { categoryId: null, beforeId: null }
  const beforeId = hover.zone === 'before' ? hover.id : peers[peers.indexOf(hover.id) + 1] ?? null
  return { categoryId: hover.categoryId, beforeId }
}

function channelSpot(tree: LayoutTree, drag: ChannelDrag, hover: DropHover, typeOf: TypeOf): Spot | null {
  switch (hover.kind) {
    case 'channel':
      return hover.id === drag.id ? null : spotOverChannel(hover, peersIn(tree, hover.categoryId, drag, typeOf), drag)
    case 'category-header':
      return {
        categoryId: hover.id,
        beforeId: hover.collapsed ? null : peersIn(tree, hover.id, drag, typeOf)[0] ?? null
      }
    case 'category-body':
      return { categoryId: hover.id, beforeId: null }
    case 'section':
      return { categoryId: null, beforeId: null }
    default:
      return null
  }
}

/** Sem categoria só importa a ordem dentro do tipo: a seção é uma por tipo. */
function sameVisibleOrder(a: LayoutTree, b: LayoutTree, type: ChannelType, typeOf: TypeOf): boolean {
  const visible = (tree: LayoutTree): unknown => ({
    free: tree.uncategorized.filter((id) => typeOf(id) === type),
    categories: tree.categories
  })
  return JSON.stringify(visible(a)) === JSON.stringify(visible(b))
}

function resolveChannelDrop(tree: LayoutTree, drag: ChannelDrag, hover: DropHover, typeOf: TypeOf): DropTarget | null {
  const spot = channelSpot(tree, drag, hover, typeOf)
  if (!spot) return null
  const next = moveChannelInTree(tree, drag.id, spot.categoryId, spot.beforeId)
  return sameVisibleOrder(tree, next, drag.type, typeOf) ? null : { kind: 'channel', ...spot, type: drag.type }
}

function categoryBefore(tree: LayoutTree, dragId: string, hover: DropHover): string | null | undefined {
  const others = tree.categories.map((category) => category.id).filter((id) => id !== dragId)
  if (hover.kind === 'section') return tree.categories[0]?.id ?? null
  if (hover.kind === 'list') return null
  if (hover.kind !== 'category-block') return undefined
  if (hover.id === dragId) return dragId
  return hover.zone === 'before' ? hover.id : others[others.indexOf(hover.id) + 1] ?? null
}

function resolveCategoryDrop(tree: LayoutTree, dragId: string, hover: DropHover): DropTarget | null {
  const beforeId = categoryBefore(tree, dragId, hover)
  if (beforeId === undefined || beforeId === dragId) return null
  const next = moveCategoryInTree(tree, dragId, beforeId)
  return JSON.stringify(next.categories) === JSON.stringify(tree.categories) ? null : { kind: 'category', beforeId }
}

/** Onde o item cairia; null se não é alvo ou se soltar ali não muda nada. */
export function resolveDrop(tree: LayoutTree, drag: SidebarDrag, hover: DropHover | null, typeOf: TypeOf): DropTarget | null {
  if (!hover) return null
  return drag.kind === 'channel' ? resolveChannelDrop(tree, drag, hover, typeOf) : resolveCategoryDrop(tree, drag.id, hover)
}

/** Faz o movimento que o item solto pede. */
export function applyDrop(
  drag: SidebarDrag,
  target: DropTarget,
  on: {
    moveCategory: (id: string, beforeId: string | null) => void
    moveChannel: (id: string, categoryId: string | null, beforeId: string | null) => void
  }
): void {
  if (drag.kind === 'category' && target.kind === 'category') on.moveCategory(drag.id, target.beforeId)
  if (drag.kind === 'channel' && target.kind === 'channel') on.moveChannel(drag.id, target.categoryId, target.beforeId)
}

/** Linha acima do canal alvo ou abaixo do último do grupo de destino. */
export function channelLine(
  target: DropTarget | null,
  rowId: string,
  rowType: ChannelType,
  rowCategory: string | null,
  last: boolean
): DropLineSide {
  if (target?.kind !== 'channel' || target.categoryId !== rowCategory) return null
  if (target.beforeId === rowId) return 'before'
  const rightSection = rowCategory !== null || rowType === target.type
  return target.beforeId === null && last && rightSection ? 'after' : null
}

/** Linha acima da categoria alvo ou abaixo da última. */
export function categoryLine(target: DropTarget | null, id: string, last: boolean): DropLineSide {
  if (target?.kind !== 'category') return null
  if (target.beforeId === id) return 'before'
  return target.beforeId === null && last ? 'after' : null
}

/** O grupo que vai receber o canal fica realçado (sem categoria: a seção do tipo). */
export function groupHighlighted(target: DropTarget | null, categoryId: string | null, sectionType?: ChannelType): boolean {
  if (target?.kind !== 'channel' || target.categoryId !== categoryId) return false
  return categoryId !== null || target.type === sectionType
}

/** Mesmo alvo sob o ponteiro (não re-renderiza à toa durante o arrasto). */
export function sameHover(a: DropHover | null, b: DropHover | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Categoria recolhida que abre se o canal ficar um instante em cima dela. */
export function peekCandidate(drag: SidebarDrag, hover: DropHover | null): string | null {
  return drag.kind === 'channel' && hover?.kind === 'category-header' && hover.collapsed ? hover.id : null
}

/** Controles dentro da linha continuam sendo controles: não começam arrasto. */
const NOT_A_HANDLE = '[data-no-drag], [data-channel-menu-button], [draggable="true"], input, select, textarea'

export function pressCanDrag(button: number, target: Element): boolean {
  return button === 0 && !target.closest(NOT_A_HANDLE)
}

const AUTO_SCROLL_BAND = 64
const AUTO_SCROLL_MAX = 14

/** Pixels a rolar neste quadro: perto da borda rola, mais rápido quanto mais perto. */
export function autoScrollStep(y: number, top: number, bottom: number): number {
  const clamped = Math.min(Math.max(y, top), bottom)
  const intoTop = top + AUTO_SCROLL_BAND - clamped
  const intoBottom = clamped - (bottom - AUTO_SCROLL_BAND)
  if (intoTop > 0) return -Math.round((intoTop / AUTO_SCROLL_BAND) * AUTO_SCROLL_MAX)
  return intoBottom > 0 ? Math.round((intoBottom / AUTO_SCROLL_BAND) * AUTO_SCROLL_MAX) : 0
}

const LIST_EDGE_INSET = 16
const LIST_OUTSIDE_MARGIN = 64

/**
 * O ponto a testar: traz o ponteiro para dentro da lista, porque as margens e o
 * espaço logo ao lado também valem como a lista. Longe dela não é alvo.
 */
export function dragPointInList(
  x: number,
  y: number,
  rect: { left: number; right: number; top: number; bottom: number }
): { x: number; y: number } | null {
  if (x < rect.left - LIST_OUTSIDE_MARGIN || x > rect.right + LIST_OUTSIDE_MARGIN) return null
  return {
    x: Math.min(Math.max(x, rect.left + LIST_EDGE_INSET), rect.right - LIST_EDGE_INSET),
    y: Math.min(Math.max(y, rect.top + 1), rect.bottom - 1)
  }
}

const GHOST_GAP = 12
const GHOST_RISE = 16
const SCREEN_MARGIN = 8

/** Onde desenhar o fantasma: ao lado do ponteiro, sem passar das bordas (360 px). */
export function ghostPosition(point: { x: number; y: number }, width: number, viewport: number): { x: number; y: number } {
  const limit = viewport - width - SCREEN_MARGIN
  return { x: Math.max(SCREEN_MARGIN, Math.min(point.x + GHOST_GAP, limit)), y: point.y - GHOST_RISE }
}

function zoneIn(element: Element, y: number): DropZone {
  const rect = element.getBoundingClientRect()
  return y - rect.top < rect.height / 2 ? 'before' : 'after'
}

const near = (element: Element, kind: string): HTMLElement | null =>
  element.closest<HTMLElement>(`[data-dnd="${kind}"]`)

function commonHover(element: Element): DropHover | null {
  const section = near(element, 'section')
  if (section) return { kind: 'section', type: section.dataset.type as ChannelType }
  return near(element, 'list') ? { kind: 'list' } : null
}

function channelDragHover(element: Element, y: number): DropHover | null {
  const row = near(element, 'channel')
  if (row) {
    return {
      kind: 'channel',
      id: row.dataset.id as string,
      type: row.dataset.type as ChannelType,
      categoryId: row.dataset.category ?? null,
      zone: zoneIn(row, y)
    }
  }
  const header = near(element, 'category-header')
  if (header) return { kind: 'category-header', id: header.dataset.id as string, collapsed: header.dataset.collapsed === 'true' }
  const block = near(element, 'category-block')
  return block ? { kind: 'category-body', id: block.dataset.id as string } : commonHover(element)
}

function categoryDragHover(element: Element, y: number): DropHover | null {
  const block = near(element, 'category-block')
  return block ? { kind: 'category-block', id: block.dataset.id as string, zone: zoneIn(block, y) } : commonHover(element)
}

/** O alvo sob o ponteiro, pelos `data-dnd` das linhas, categorias e seções. */
export function hoverFromElement(element: Element | null, y: number, drag: SidebarDrag['kind']): DropHover | null {
  if (!element) return null
  return drag === 'channel' ? channelDragHover(element, y) : categoryDragHover(element, y)
}
