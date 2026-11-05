import { useState } from 'react'
import type { Category, CategoryLayout } from '../api/categories'
import type { Channel } from '../api/channels'
import { groupChannelsByCategory } from '../lib/categoryGroups'
import { channelsWithPlacement } from '../lib/categoryLayout'
import { buildLayoutTree, moveCategoryInTree, moveChannelInTree, type LayoutTree } from '../lib/channelLayoutTree'

export type PlacedChannel = Channel & { category_id: string | null; synced: boolean }

export interface SidebarLayout {
  categories: Category[]
  grouped: ReturnType<typeof groupChannelsByCategory<Category, PlacedChannel>>
  tree: LayoutTree
  moveChannel: (id: string, categoryId: string | null, beforeId: string | null) => void
  moveCategory: (id: string, beforeId: string | null) => void
  /** Para leitor de tela: o resultado da última mudança. */
  announcement: string
}

/** A organização da barra: como agrupar e como gravar cada mudança. */
export function useSidebarLayout(
  layout: CategoryLayout | null,
  channels: Channel[],
  saveLayout: (tree: LayoutTree) => void
): SidebarLayout {
  const [announcement, setAnnouncement] = useState('')
  const categories = layout?.categories ?? []
  const placed = channelsWithPlacement(channels, layout?.channels ?? [])
  const tree = buildLayoutTree(categories, placed)
  return {
    categories,
    grouped: groupChannelsByCategory(categories, placed),
    tree,
    moveChannel: (id, categoryId, beforeId) => {
      saveLayout(moveChannelInTree(tree, id, categoryId, beforeId))
      setAnnouncement('Canal movido.')
    },
    moveCategory: (id, beforeId) => {
      saveLayout(moveCategoryInTree(tree, id, beforeId))
      setAnnouncement('Categoria movida.')
    },
    announcement
  }
}
