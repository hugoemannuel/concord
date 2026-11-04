import { useState } from 'react'
import type { Category, CategoryLayout } from '../api/categories'
import type { Channel, ChannelType } from '../api/channels'
import { groupChannelsByCategory } from '../lib/categoryGroups'
import { channelsWithPlacement } from '../lib/categoryLayout'
import { buildLayoutTree, moveCategoryInTree, moveChannelInTree, type LayoutTree } from '../lib/channelLayoutTree'
import { saveChannelOrder } from '../lib/saveChannelOrder'

export type PlacedChannel = Channel & { category_id: string | null }

export interface SidebarLayout {
  categories: Category[]
  grouped: ReturnType<typeof groupChannelsByCategory<Category, PlacedChannel>>
  tree: LayoutTree
  typeOf: (id: string) => ChannelType
  moveChannel: (id: string, categoryId: string | null, beforeId: string | null) => void
  moveCategory: (id: string, beforeId: string | null) => void
  /** Para leitor de tela: o resultado da última mudança. */
  announcement: string
}

/** A organização da barra: como agrupar e para onde cada mudança vai (com ou sem categorias). */
export function useSidebarLayout(
  serverId: string,
  layout: CategoryLayout | null,
  channels: Channel[],
  saveLayout: (tree: LayoutTree) => void
): SidebarLayout {
  const [announcement, setAnnouncement] = useState('')
  const categories = layout?.categories ?? []
  // Sem categorias, a API antiga volta a ordenar os canais: ignore posições residuais.
  const placements = categories.length > 0 ? layout?.channels ?? [] : []
  const placed = channelsWithPlacement(channels, placements)
  const tree = buildLayoutTree(categories, placed)
  const types = new Map(placed.map((channel) => [channel.id, channel.type ?? 'text']))
  const typeOf = (id: string): ChannelType => types.get(id) ?? 'text'
  const commitChannel = (next: LayoutTree, id: string): void => {
    if (categories.length > 0) saveLayout(next)
    else void saveChannelOrder(serverId, typeOf(id), next.uncategorized.filter((item) => typeOf(item) === typeOf(id)))
  }
  return {
    categories,
    grouped: groupChannelsByCategory(categories, placed),
    tree,
    typeOf,
    moveChannel: (id, categoryId, beforeId) => {
      commitChannel(moveChannelInTree(tree, id, categoryId, beforeId), id)
      setAnnouncement('Canal movido.')
    },
    moveCategory: (id, beforeId) => {
      saveLayout(moveCategoryInTree(tree, id, beforeId))
      setAnnouncement('Categoria movida.')
    },
    announcement
  }
}
