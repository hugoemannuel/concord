import { useState } from 'react'
import type { Channel, ChannelType } from '../api/channels'
import type { Category, CategoryLayout } from '../api/categories'
import { categoryStepBefore, type LayoutTree } from '../lib/channelLayoutTree'
import { categoryLine, channelLine, groupHighlighted, type DropTarget, type SidebarDrag } from '../lib/sidebarDrop'
import { useCollapsedCategories } from '../hooks/useCollapsedCategories'
import { useSidebarDrag } from '../hooks/useSidebarDrag'
import { useSidebarLayout, type PlacedChannel } from '../hooks/useSidebarLayout'
import { CategoryHeader } from './CategoryHeader'
import { CategoryChannelControls } from './CategoryChannelControls'
import { CategoryDialogs, type CategoryDialog } from './CategoryDialogs'
import { ChannelDropLine } from './ChannelSection'
import { SidebarDragGhost } from './SidebarDragGhost'

/** Move o canal (pelo menu): para qual categoria e antes de qual canal. */
export type MoveChannel = (move: { channel: string; category: string | null; before: string | null }) => void

/** O que a seção "sem categoria" de um tipo recebe para virar alvo de soltar. */
export interface SectionDrop {
  dropProps: React.HTMLAttributes<HTMLDivElement>
  highlighted: boolean
}

interface Props {
  serverId: string
  userId: string
  layout: CategoryLayout | null
  channels: Channel[]
  canManage: boolean
  run: (operation: () => Promise<void>) => Promise<boolean>
  saveLayout: (tree: LayoutTree) => void
  renderChannel: (channel: Channel, group: PlacedChannel[], controls: React.ReactNode, move: MoveChannel) => React.ReactNode
  onCreateChannel: (type: ChannelType, categoryId?: string) => void
  fallback: (
    onCreateCategory: () => void,
    channels: Channel[],
    renderRows: (group: Channel[]) => React.ReactNode,
    sectionDrop: (type: ChannelType) => SectionDrop
  ) => React.ReactNode
}

const HIGHLIGHT = 'bg-brand/10 ring-1 ring-brand/40'

export function CategoryPanel({ serverId, userId, layout, channels, canManage, run, saveLayout, renderChannel, fallback, onCreateChannel }: Props): React.JSX.Element {
  const [dialog, setDialog] = useState<CategoryDialog | null>(null)
  const [collapsed, setCollapsed] = useCollapsedCategories(userId, serverId)
  const sidebar = useSidebarLayout(serverId, layout, channels, saveLayout)
  const { categories, grouped, tree } = sidebar
  // Soltou numa categoria recolhida: abre, para mostrar onde o canal foi parar.
  const openDestination = (categoryId: string | null): void => {
    if (categoryId && collapsed.includes(categoryId)) setCollapsed(collapsed.filter((id) => id !== categoryId))
  }
  const onDrop = (source: SidebarDrag, landed: DropTarget): void => {
    if (source.kind === 'category' && landed.kind === 'category') sidebar.moveCategory(source.id, landed.beforeId)
    if (source.kind === 'channel' && landed.kind === 'channel') {
      sidebar.moveChannel(source.id, landed.categoryId, landed.beforeId)
      openDestination(landed.categoryId)
    }
  }
  // Antes de a organização chegar não dá para saber qual rota grava: ainda não arrasta.
  const dnd = useSidebarDrag({ serverId, canManage: canManage && layout !== null, tree, typeOf: sidebar.typeOf, onDrop })
  const menuMove: MoveChannel = ({ channel, category, before }) => sidebar.moveChannel(channel, category, before)
  const rows = (group: PlacedChannel[], category: string | null): React.ReactNode => group.map((channel, index) => (
    <div key={channel.id} {...dnd.channelRow(channel.id, channel.type ?? 'text', category)}
      className={`relative transition-opacity ${canManage ? 'select-none [-webkit-touch-callout:none]' : ''} ${dnd.drag?.id === channel.id ? 'opacity-40' : ''}`}>
      <ChannelDropLine side={channelLine(dnd.target, channel.id, channel.type ?? 'text', category, index === group.length - 1)} />
      {renderChannel(channel, group, canManage && categories.length > 0
        ? <CategoryChannelControls channelName={channel.name} categories={categories} categoryId={category} onCategory={(id) => sidebar.moveChannel(channel.id, id, null)} />
        : undefined, menuMove)}
    </div>
  ))
  const toggle = (id: string): void => setCollapsed(collapsed.includes(id) ? collapsed.filter((item) => item !== id) : [...collapsed, id])
  const stepCategory = (id: string, direction: 'up' | 'down'): void => {
    const step = categoryStepBefore(tree, id, direction)
    if (step.ok) sidebar.moveCategory(id, step.before)
  }
  const categoryGroup = (category: Category, group: PlacedChannel[], index: number): React.ReactNode => {
    const closed = collapsed.includes(category.id) && !dnd.isPeeked(category.id)
    return (
      <section key={category.id} {...dnd.categoryBlock(category.id)} className={`relative pb-4 transition-opacity ${dnd.drag?.id === category.id ? 'opacity-40' : ''}`}>
        <ChannelDropLine side={categoryLine(dnd.target, category.id, index === categories.length - 1)} />
        <div className={`rounded-lg transition-colors ${groupHighlighted(dnd.target, category.id) ? HIGHLIGHT : ''}`}>
          <CategoryHeader category={category} collapsed={closed} canManage={canManage}
            dragProps={dnd.categoryHeader(category.id, closed)}
            canMoveUp={categoryStepBefore(tree, category.id, 'up').ok}
            canMoveDown={categoryStepBefore(tree, category.id, 'down').ok}
            onCreateChannel={() => onCreateChannel('text', category.id)}
            onToggle={() => toggle(category.id)}
            onCollapseAll={() => setCollapsed(categories.map((item) => item.id))}
            onEdit={() => setDialog({ kind: 'edit', category })} onDelete={() => setDialog({ kind: 'delete', category })}
            onMove={(direction) => stepCategory(category.id, direction)} />
          {!closed && (
            <div className="mt-1 flex flex-col gap-0.5">
              {rows(group, category.id)}
            </div>
          )}
        </div>
      </section>
    )
  }
  const sectionDrop = (type: ChannelType): SectionDrop => ({
    dropProps: dnd.section(type),
    highlighted: groupHighlighted(dnd.target, null, type)
  })
  const draggedCategory = grouped.groups.find((group) => group.category.id === dnd.drag?.id)
  return <>
    {fallback(() => setDialog({ kind: 'create' }), grouped.uncategorized, (group) => rows(group.map((channel) => ({ ...channel, category_id: null })), null), sectionDrop)}
    {grouped.groups.map(({ category, channels: group }, index) => categoryGroup(category, group, index))}
    {dialog && <CategoryDialogs key={dialog.kind + (dialog.kind === 'create' ? '' : dialog.category.id)} serverId={serverId} dialog={dialog} close={() => setDialog(null)} run={run} />}
    <p role="status" className="sr-only">{sidebar.announcement}</p>
    {dnd.drag && (
      <SidebarDragGhost drag={dnd.drag} attach={dnd.attachGhost}
        title={draggedCategory?.category.name ?? channels.find((channel) => channel.id === dnd.drag?.id)?.name ?? ''}
        names={draggedCategory?.channels.map((channel) => channel.name) ?? []} />
    )}
  </>
}
