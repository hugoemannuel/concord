import { useParams } from 'react-router-dom'
import type { Channel, ChannelType } from '../api/channels'
import { syncChannelWithCategory, type Category, type CategoryLayout } from '../api/categories'
import { isPrivateCategory } from '../lib/categoryPrivacy'
import { categoryStepBefore, type LayoutTree } from '../lib/channelLayoutTree'
import { hidesChannel } from '../lib/hideMutedChannels'
import { everyoneRole } from '../lib/permissions'
import { applyDrop, categoryLine, channelLine, groupHighlighted, type DropTarget, type SidebarDrag } from '../lib/sidebarDrop'
import { useCollapsedCategories } from '../hooks/useCollapsedCategories'
import { useSidebarDrag } from '../hooks/useSidebarDrag'
import { useSidebarLayout, type PlacedChannel } from '../hooks/useSidebarLayout'
import { useChatStore } from '../../chat/store/chatStore'
import { useNotifySettingsStore } from '../../notifications/store/notifySettingsStore'
import { useNow } from '../../../shared/hooks/useNow'
import { ChannelListSkeleton } from '../../../shared/ui/skeleton/layouts'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import { useHideMutedStore } from '../store/hideMutedStore'
import { useServerStore } from '../store/serverStore'
import { CategoryHeader } from './CategoryHeader'
import { CategoryChannelControls } from './CategoryChannelControls'
import { CategoryDialogs } from './CategoryDialogs'
import { CategoryPermissionsModal } from './CategoryPermissionsModal'
import { ChannelDropLine } from './ChannelDropLine'
import { SidebarDragGhost } from './SidebarDragGhost'

/** Move o canal (pelo menu): para qual categoria e antes de qual canal. */
export type MoveChannel = (move: { channel: string; category: string | null; before: string | null }) => void

interface Props {
  serverId: string
  userId: string
  layout: CategoryLayout | null
  channels: Channel[]
  /** A lista já é deste servidor (senão, o esqueleto). */
  ready: boolean
  canManage: boolean
  canManageRoles: boolean
  run: (operation: () => Promise<void>) => Promise<boolean>
  saveLayout: (tree: LayoutTree) => void
  renderChannel: (channel: Channel, group: PlacedChannel[], controls: React.ReactNode, move: MoveChannel) => React.ReactNode
  onCreateChannel: (type: ChannelType, categoryId?: string) => void
}

const HIGHLIGHT = 'bg-brand/10 ring-1 ring-brand/40'

/** O filtro de "Ocultar canais silenciados" (desligado, não esconde nada). */
function useMutedFilter(userId: string, serverId: string): (channel: { id: string }) => boolean {
  const { channelId } = useParams<{ channelId: string }>()
  const on = useHideMutedStore((s) => s.isOn(userId, serverId))
  const settings = useNotifySettingsStore((s) => s.channels)
  const unreadByRoom = useChatStore((s) => s.unreadByRoom)
  const mentionsByRoom = useChatStore((s) => s.mentionsByRoom)
  const now = useNow()
  if (!on) return () => true
  return (channel) => !hidesChannel(channel.id, { settings, unreadByRoom, mentionsByRoom, activeChannelId: channelId, now })
}

/** Os canais soltos no topo e as categorias, com arrastar, menus e diálogos. */
export function CategoryPanel({ serverId, userId, layout, channels, ready, canManage, canManageRoles, run, saveLayout, renderChannel, onCreateChannel }: Props): React.JSX.Element {
  const dialog = useChannelSidebarStore((s) => s.categoryDialog)
  const openDialog = useChannelSidebarStore((s) => s.openCategoryDialog)
  const closeDialog = useChannelSidebarStore((s) => s.closeCategoryDialog)
  const everyoneId = everyoneRole(useServerStore((s) => s.roles))?.id
  const [collapsed, setCollapsed] = useCollapsedCategories(userId, serverId)
  const sidebar = useSidebarLayout(layout, channels, saveLayout)
  const { categories, grouped, tree } = sidebar
  const shown = useMutedFilter(userId, serverId)
  // Soltou numa categoria recolhida: abre, para mostrar onde o canal foi parar.
  const openDestination = (categoryId: string | null): void => {
    if (categoryId && collapsed.includes(categoryId)) setCollapsed(collapsed.filter((id) => id !== categoryId))
  }
  const onDrop = (source: SidebarDrag, landed: DropTarget): void => applyDrop(source, landed, {
    moveCategory: sidebar.moveCategory,
    moveChannel: (id, categoryId, beforeId) => {
      sidebar.moveChannel(id, categoryId, beforeId)
      openDestination(categoryId)
    }
  })
  // Antes de a organização chegar não dá para gravar: ainda não arrasta.
  const dnd = useSidebarDrag({ serverId, canManage: canManage && layout !== null, tree, onDrop })
  const menuMove: MoveChannel = ({ channel, category, before }) => sidebar.moveChannel(channel, category, before)
  const controls = (channel: PlacedChannel, category: string | null): React.ReactNode => {
    if (!canManage) return undefined
    const unsynced = category !== null && !channel.synced
    if (categories.length === 0 && !unsynced) return undefined
    return (
      <CategoryChannelControls channelName={channel.name} categories={categories} categoryId={category} unsynced={unsynced}
        onCategory={(id) => sidebar.moveChannel(channel.id, id, null)}
        onSync={canManageRoles ? () => void run(() => syncChannelWithCategory(serverId, channel.id)) : undefined} />
    )
  }
  const rows = (all: PlacedChannel[], category: string | null): React.ReactNode => {
    const group = all.filter(shown)
    return group.map((channel, index) => (
      <div key={channel.id} data-sidebar-item {...dnd.channelRow(channel.id, channel.type ?? 'text', category)}
        className={`relative transition-opacity ${canManage ? 'select-none [-webkit-touch-callout:none]' : ''} ${dnd.drag?.id === channel.id ? 'opacity-40' : ''}`}>
        <ChannelDropLine side={channelLine(dnd.target, channel.id, category, index === group.length - 1)} />
        {canManage && category !== null && !channel.synced && (
          <span title="Permissões próprias: este canal não segue a categoria" role="img" aria-label="Permissões próprias: este canal não segue a categoria"
            className="absolute left-0.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-warning" />
        )}
        {renderChannel(channel, group, controls(channel, category), menuMove)}
      </div>
    ))
  }
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
          <CategoryHeader category={category} isPrivate={isPrivateCategory(category, everyoneId)} collapsed={closed} canManage={canManage} canManageRoles={canManageRoles}
            dragProps={dnd.categoryHeader(category.id, closed)}
            canMoveUp={categoryStepBefore(tree, category.id, 'up').ok}
            canMoveDown={categoryStepBefore(tree, category.id, 'down').ok}
            onCreateChannel={() => onCreateChannel('text', category.id)}
            onToggle={() => toggle(category.id)}
            onCollapseAll={() => setCollapsed(categories.map((item) => item.id))}
            onEdit={() => openDialog({ kind: 'edit', category })}
            onPermissions={() => openDialog({ kind: 'permissions', category })}
            onDelete={() => openDialog({ kind: 'delete', category })}
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
  const draggedCategory = grouped.groups.find((group) => group.category.id === dnd.drag?.id)
  const draggingChannel = dnd.drag?.kind === 'channel'
  const noLoose = grouped.uncategorized.length === 0
  return <>
    {!ready && <ChannelListSkeleton count={6} />}
    {ready && channels.length === 0 && categories.length === 0 && <p className="px-2 text-ds-sm text-faint italic">Nenhum canal ainda.</p>}
    <div {...dnd.loose()} className={`flex flex-col gap-0.5 rounded-lg transition-colors ${noLoose && !draggingChannel ? '' : 'pb-4'} ${groupHighlighted(dnd.target, null) ? HIGHLIGHT : ''}`}>
      {rows(grouped.uncategorized, null)}
      {noLoose && draggingChannel && <p className="rounded-lg border border-dashed border-subtle px-2 py-2 text-center text-ds-xs text-faint">Solte aqui para ficar sem categoria</p>}
    </div>
    {grouped.groups.map(({ category, channels: group }, index) => categoryGroup(category, group, index))}
    {dialog?.kind === 'permissions' && <CategoryPermissionsModal serverId={serverId} category={categories.find((item) => item.id === dialog.category.id) ?? dialog.category} run={run} onClose={closeDialog} />}
    {dialog && dialog.kind !== 'permissions' && <CategoryDialogs key={dialog.kind + (dialog.kind === 'create' ? '' : dialog.category.id)} serverId={serverId} dialog={dialog} canManageRoles={canManageRoles} close={closeDialog} run={run} />}
    <p role="status" className="sr-only">{sidebar.announcement}</p>
    {dnd.drag && (
      <SidebarDragGhost drag={dnd.drag} attach={dnd.attachGhost}
        title={draggedCategory?.category.name ?? channels.find((channel) => channel.id === dnd.drag?.id)?.name ?? ''}
        names={draggedCategory?.channels.map((channel) => channel.name) ?? []} />
    )}
  </>
}
