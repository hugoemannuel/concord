// A organização da barra de canais como árvore: categorias na ordem, cada uma
// com os canais dela, mais a lista sem categoria. Tudo puro, sem React.
import type { Category, CategoryLayout, CategoryLayoutWrite } from '../api/categories'
import { groupChannelsByCategory } from './categoryGroups'

export interface LayoutTree {
  uncategorized: string[]
  categories: { id: string; channels: string[] }[]
}

export function buildLayoutTree(
  categories: Category[],
  channels: { id: string; category_id?: string | null }[]
): LayoutTree {
  const grouped = groupChannelsByCategory(categories, channels)
  return {
    uncategorized: grouped.uncategorized.map((channel) => channel.id),
    categories: grouped.groups.map((group) => ({
      id: group.category.id,
      channels: group.channels.map((channel) => channel.id)
    }))
  }
}

/** Move a categoria inteira (com os canais) para antes de outra, ou para o fim. */
export function moveCategoryInTree(tree: LayoutTree, id: string, beforeId: string | null): LayoutTree {
  const moving = tree.categories.find((category) => category.id === id)
  const rest = tree.categories.filter((category) => category.id !== id)
  const index = beforeId === null ? rest.length : rest.findIndex((category) => category.id === beforeId)
  if (!moving || index < 0) return tree
  return { ...tree, categories: [...rest.slice(0, index), moving, ...rest.slice(index)] }
}

/** Alvo de "Mover para cima/baixo" da categoria; `ok: false` já está no limite. */
export function categoryStepBefore(
  tree: LayoutTree,
  id: string,
  direction: 'up' | 'down'
): { ok: true; before: string | null } | { ok: false } {
  const ids = tree.categories.map((category) => category.id)
  const index = ids.indexOf(id)
  const offset = direction === 'up' ? -1 : 2
  if (index < 0 || (direction === 'up' && index === 0) || (direction === 'down' && index === ids.length - 1)) {
    return { ok: false }
  }
  return { ok: true, before: ids[index + offset] ?? null }
}

function insertBefore(ids: string[], id: string, beforeId: string | null): string[] {
  const index = beforeId === null ? -1 : ids.indexOf(beforeId)
  return index < 0 ? [...ids, id] : [...ids.slice(0, index), id, ...ids.slice(index)]
}

function hasChannel(tree: LayoutTree, id: string): boolean {
  return tree.uncategorized.includes(id) || tree.categories.some((category) => category.channels.includes(id))
}

/** Move o canal para a categoria (null = sem categoria), antes de outro ou no fim. */
export function moveChannelInTree(
  tree: LayoutTree,
  id: string,
  categoryId: string | null,
  beforeId: string | null
): LayoutTree {
  const knownDestination = categoryId === null || tree.categories.some((category) => category.id === categoryId)
  if (!knownDestination || !hasChannel(tree, id)) return tree
  const without = (ids: string[]): string[] => ids.filter((item) => item !== id)
  const place = (ids: string[], group: string | null): string[] =>
    group === categoryId ? insertBefore(without(ids), id, beforeId) : without(ids)
  return {
    uncategorized: place(tree.uncategorized, null),
    categories: tree.categories.map((category) => ({
      id: category.id,
      channels: place(category.channels, category.id)
    }))
  }
}

/** O pedido de gravação: categorias na ordem e cada canal com categoria e posição. */
export function treeToLayoutWrite(tree: LayoutTree): CategoryLayoutWrite {
  const group = (ids: string[], categoryId: string | null): CategoryLayoutWrite['channels'] =>
    ids.map((id, position) => ({ channel_id: id, category_id: categoryId, position }))
  return {
    categories: tree.categories.map((category) => category.id),
    channels: [
      ...group(tree.uncategorized, null),
      ...tree.categories.flatMap((category) => group(category.channels, category.id))
    ]
  }
}

/** A mesma organização no formato da API (atualização otimista). */
export function applyTreeToLayout(layout: CategoryLayout, tree: LayoutTree): CategoryLayout {
  const byId = new Map(layout.categories.map((category) => [category.id, category]))
  return {
    ...layout,
    categories: tree.categories.flatMap((category, position) => {
      const known = byId.get(category.id)
      return known ? [{ ...known, position }] : []
    }),
    channels: treeToLayoutWrite(tree).channels
  }
}
