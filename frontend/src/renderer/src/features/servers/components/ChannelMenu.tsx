import { forwardRef } from 'react'
import type { Channel, ChannelType } from '../api/channels'
import { setPrimaryChannel } from '../api/servers'
import { useServerStore } from '../store/serverStore'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import { useNotifySettingsStore } from '../../notifications/store/notifySettingsStore'
import { showToast } from '../../../shared/store/toastStore'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DotsIcon,
  LockIcon,
  PencilIcon,
  StarIcon,
  TrashIcon
} from '../../../shared/ui/icons'
import { errorText } from '../lib/channelSidebar'
import { channelMenuItems, type ChannelMenuItem } from '../lib/sidebarMenus'
import { Perm } from '../lib/permissions'
import type { ServerAccess } from '../lib/serverAccess'
import SidebarMenuItem, { type SidebarMenuTone } from './SidebarMenuItem'

/** `onHover`: só aparece com o mouse em cima (fica no lugar da contagem). */
export function ChannelMenuButton({
  channelId,
  onHover = false
}: {
  channelId: string
  onHover?: boolean
}): React.JSX.Element {
  const open = useChannelSidebarStore((s) => s.menuFor === channelId)
  const toggleMenu = useChannelSidebarStore((s) => s.toggleMenu)
  return (
    <button
      onClick={() => toggleMenu(channelId)}
      data-channel-menu-button=""
      aria-label="Opções do canal"
      title="Opções do canal"
      className={`absolute right-1.5 top-1.5 z-10 flex h-5 items-center rounded-md px-0.5 text-faint [@media(pointer:coarse)]:right-0 [@media(pointer:coarse)]:top-0 [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:px-2.5 transition-[color,background-color,opacity] hover:bg-fg/10 hover:text-strong cursor-pointer ${
        onHover && !open
          ? '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/voicech:opacity-100 focus-visible:opacity-100'
          : ''
      }`}
    >
      <DotsIcon size={16} />
    </button>
  )
}

const ICON = 'h-3.5 w-3.5'

const LOOK: Record<
  ChannelMenuItem,
  { label: string; icon?: React.ReactNode; tone?: SidebarMenuTone }
> = {
  notifications: { label: 'Notificações do canal' },
  'move-up': { label: 'Mover para cima', icon: <ChevronUpIcon className={ICON} /> },
  'move-down': { label: 'Mover para baixo', icon: <ChevronDownIcon className={ICON} /> },
  'make-primary': {
    label: 'Definir como principal',
    icon: <StarIcon className={`${ICON} text-warning`} />
  },
  edit: { label: 'Editar canal', icon: <PencilIcon className={ICON} /> },
  permissions: { label: 'Permissões', icon: <LockIcon className={ICON} /> },
  delete: { label: 'Deletar canal', icon: <TrashIcon className={ICON} />, tone: 'danger' }
}

/** O canal vira o principal (onde vão os avisos do servidor). */
async function makePrimary(serverId: string, ch: Channel): Promise<void> {
  try {
    const updated = await setPrimaryChannel(serverId, ch.id)
    useServerStore.getState().updateLocalServer(updated)
    showToast.success(`#${ch.name} agora é o canal principal.`)
  } catch (err) {
    showToast.error(errorText(err, 'Não foi possível mudar o canal principal.'))
  }
}

interface ChannelMenuProps {
  serverId: string
  channel: Channel
  items: ChannelMenuItem[]
  /** Posição do canal na seção (para subir e descer). */
  index: number
  move: (from: number, to: number) => void
}

/** Menu "•••" (ou botão direito) de um canal. */
const ChannelMenu = forwardRef<HTMLDivElement, ChannelMenuProps>(function ChannelMenu(
  { serverId, channel, items, index, move },
  ref
) {
  const sidebar = useChannelSidebarStore()
  const openNotifyModal = useNotifySettingsStore((s) => s.openModal)
  const actions: Record<ChannelMenuItem, () => void> = {
    notifications: () => openNotifyModal({ serverId, channelId: channel.id, name: channel.name }),
    'move-up': () => move(index, index - 1),
    'move-down': () => move(index, index + 1),
    'make-primary': () => void makePrimary(serverId, channel),
    edit: () => sidebar.openEdit(channel),
    permissions: () => sidebar.openPermissions(channel),
    delete: () => sidebar.askDelete(channel)
  }
  return (
    <div
      ref={ref}
      className="absolute right-1.5 top-full z-30 mt-1 flex w-48 flex-col rounded-xl border border-subtle bg-floating p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in"
    >
      {items.map((item) => (
        <SidebarMenuItem
          key={item}
          {...LOOK[item]}
          onClick={() => {
            sidebar.closeMenu()
            actions[item]()
          }}
        />
      ))}
    </div>
  )
})

interface ChannelMenuHostProps {
  serverId: string
  channel: Channel
  /** A seção do canal (texto ou voz), na ordem da barra. */
  section: Channel[]
  primaryId: string | null
  access: ServerAccess
  move: (type: ChannelType, from: number, to: number) => void
  menuRef: React.Ref<HTMLDivElement>
}

/** O menu do canal, quando é este que está aberto (cada item se esconde sem a permissão). */
export function ChannelMenuHost({
  serverId,
  channel,
  section,
  primaryId,
  access,
  move,
  menuRef
}: ChannelMenuHostProps): React.JSX.Element | null {
  const open = useChannelSidebarStore((s) => s.menuFor === channel.id)
  if (!open) return null
  const type = channel.type ?? 'text'
  const index = section.findIndex((c) => c.id === channel.id)
  const items = channelMenuItems({
    hasServer: true,
    isText: type === 'text',
    isSystem: Boolean(channel.is_system),
    isManaged: Boolean(channel.managed),
    isPrimary: channel.id === primaryId,
    index,
    sectionLength: section.length,
    canManageChannels: access.can(Perm.MANAGE_CHANNELS),
    canManageServer: access.can(Perm.MANAGE_SERVER),
    canManageRolesHere: access.canInChannel(channel.id, Perm.MANAGE_ROLES)
  })
  return (
    <ChannelMenu
      ref={menuRef}
      serverId={serverId}
      channel={channel}
      items={items}
      index={index}
      move={(from, to) => move(type, from, to)}
    />
  )
}

export default ChannelMenu
