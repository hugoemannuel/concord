import { useState } from 'react'
import type { Channel, ChannelType } from '../api/channels'
import type { Category, CategoryLayout } from '../api/categories'
import { moveCategory, moveCategoryChannel } from '../api/categories'
import { channelsWithPlacement, nextChannelAfterMove, validCategoryDrag } from '../lib/categoryLayout'
import { groupChannelsByCategory } from '../lib/categoryGroups'
import { useCollapsedCategories } from '../hooks/useCollapsedCategories'
import { CategoryHeader } from './CategoryHeader'
import { CategoryChannelControls } from './CategoryChannelControls'
import { CategoryDialogs, type CategoryDialog } from './CategoryDialogs'

type PlacedChannel = Channel & { category_id: string | null }
interface Props {
  serverId: string
  userId: string
  layout: CategoryLayout | null
  channels: Channel[]
  canManage: boolean
  run: (operation: () => Promise<void>) => Promise<boolean>
  renderChannel: (channel: Channel, group: Channel[], index: number, controls?: React.ReactNode) => React.ReactNode
  onCreateChannel: (type: ChannelType, categoryId?: string) => void
  fallback: (onCreateCategory: () => void, channels: Channel[], renderRows: (group: Channel[]) => React.ReactNode) => React.ReactNode
}

const DRAG_TYPE = 'application/x-salinha-channel-category'

export function CategoryPanel({ serverId, userId, layout, channels, canManage, run, renderChannel, fallback, onCreateChannel }: Props): React.JSX.Element {
  const [dialog, setDialog] = useState<CategoryDialog | null>(null)
  const [collapsed, setCollapsed] = useCollapsedCategories(userId, serverId)
  const categories = layout?.categories ?? []
  // Sem categorias, a API antiga volta a ordenar os canais: ignore posições residuais.
  const placements = categories.length > 0 ? layout?.channels ?? [] : []
  const grouped = groupChannelsByCategory(categories, channelsWithPlacement(channels, placements))
  const move = (channel: string, category: string | null, before: string | null = null): void => {
    void run(() => moveCategoryChannel(serverId, channel, category, before))
  }
  const drop = (event: React.DragEvent, category: string | null, before: string | null = null): void => {
    if (!canManage) return
    const id = event.dataTransfer.getData(DRAG_TYPE)
    if (!validCategoryDrag(id, before, channels)) return
    event.preventDefault(); event.stopPropagation(); move(id, category, before)
  }
  const rows = (group: PlacedChannel[], category: string | null): React.ReactNode => group.map((channel, index) => (
    <div key={channel.id} draggable={canManage} onDragStart={(event) => {
      event.dataTransfer.setData(DRAG_TYPE, channel.id); event.dataTransfer.effectAllowed = 'move'
    }} onDragOver={(event) => { if (canManage) event.preventDefault() }} onDrop={(event) => drop(event, category, channel.id)}>
      {renderChannel(channel, group, index, canManage ? <CategoryChannelControls channelId={channel.name} categories={categories} categoryId={category} index={index} count={group.length}
        onCategory={(id) => move(channel.id, id)}
        onMove={(to) => move(channel.id, category, nextChannelAfterMove(group.map((item) => item.id), index, to))} /> : undefined)}
    </div>
  ))
  const categoryGroup = (category: Category, group: PlacedChannel[]): React.ReactNode => (
    <section key={category.id}>
      <CategoryHeader category={category} collapsed={collapsed.includes(category.id)} canManage={canManage}
        onCreateChannel={() => onCreateChannel('text', category.id)}
        onToggle={() => setCollapsed(collapsed.includes(category.id) ? collapsed.filter((id) => id !== category.id) : [...collapsed, category.id])}
        onCollapseAll={() => setCollapsed(categories.map((item) => item.id))}
        onEdit={() => setDialog({ kind: 'edit', category })} onDelete={() => setDialog({ kind: 'delete', category })}
        onMove={(direction) => void run(() => moveCategory(serverId, category.id, direction))}
        onDrop={(event) => drop(event, category.id)} />
      {!collapsed.includes(category.id) && <div className="mt-1 space-y-1" onDragOver={(event) => { if (canManage) event.preventDefault() }} onDrop={(event) => drop(event, category.id)}>{rows(group, category.id)}</div>}
    </section>
  )
  return <>
    {fallback(() => setDialog({ kind: 'create' }), grouped.uncategorized, (group) => rows(group.map((channel) => ({ ...channel, category_id: null })), null))}
    {grouped.groups.map(({ category, channels: group }) => categoryGroup(category, group))}
    {dialog && <CategoryDialogs key={dialog.kind + (dialog.kind === 'create' ? '' : dialog.category.id)} serverId={serverId} dialog={dialog} close={() => setDialog(null)} run={run} />}
  </>
}
