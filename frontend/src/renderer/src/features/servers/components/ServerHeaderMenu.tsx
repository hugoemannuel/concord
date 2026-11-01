import { useState } from 'react'
import type { Server } from '../api/servers'
import { useAuthStore } from '../../auth/store/authStore'
import { useModerationStore } from '../../call/store/moderationStore'
import { useNotifySettingsStore } from '../../notifications/store/notifySettingsStore'
import { useUIStore } from '../../../shared/store/uiStore'
import { Skeleton } from '../../../shared/ui/skeleton/Skeleton'
import {
  CalendarIcon,
  ChevronDownIcon,
  GearIcon,
  PencilIcon,
  TrashIcon,
  UserPlusIcon,
  XIcon
} from '../../../shared/ui/icons'
import { useServerStore } from '../store/serverStore'
import { useServerSettingsStore } from '../store/serverSettingsStore'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import { Perm } from '../lib/permissions'
import type { ServerAccess } from '../lib/serverAccess'
import { serverDisplayName } from '../lib/serverNames'
import { canOpenServerSettings } from '../lib/serverSettingsNav'
import { serverMenuItems, type ServerMenuItem } from '../lib/sidebarMenus'
import { WRAP_NAME } from '../lib/voiceChannelRow'
import SidebarMenuItem, { type SidebarMenuTone } from './SidebarMenuItem'
import ServerLevelCard from '../../serverlevel/components/ServerLevelCard'
import ServerLevelChip from '../../serverlevel/components/ServerLevelChip'
import ServerLevelModal from '../../serverlevel/components/ServerLevelModal'
import { useServerLevelModalStore } from '../../serverlevel/store/serverLevelModalStore'
import EventsPanelHost from '../../events/components/EventsPanelHost'
import { useEventAccess } from '../../events/hooks/useEventAccess'
import { useEventsPanelStore } from '../../events/store/eventsPanelStore'

const LOOK: Record<
  ServerMenuItem,
  { label: string; icon?: React.ReactNode; tone?: SidebarMenuTone }
> = {
  invite: {
    label: 'Convidar pessoas',
    icon: <UserPlusIcon className="h-4 w-4" />,
    tone: 'brand'
  },
  nickname: { label: 'Alterar apelido', icon: <PencilIcon className="h-3.5 w-3.5" /> },
  events: { label: 'Eventos', icon: <CalendarIcon className="h-3.5 w-3.5" /> },
  notifications: { label: 'Notificações do servidor' },
  settings: { label: 'Configurações do servidor', icon: <GearIcon className="h-3.5 w-3.5" /> },
  leave: { label: 'Sair do servidor', icon: <TrashIcon className="h-3.5 w-3.5" />, tone: 'danger' },
  delete: {
    label: 'Deletar servidor',
    icon: <TrashIcon className="h-3.5 w-3.5" />,
    tone: 'danger'
  }
}

type Me = NonNullable<ReturnType<typeof useAuthStore.getState>['user']>

/** Pede o meu apelido neste servidor (o mesmo diálogo da moderação). */
function askOwnNickname(server: Server, user: Me): void {
  const mine = useServerStore.getState().currentMembers.find((m) => m.user_id === user.id)
  useModerationStore.getState().askNickname({
    serverId: server.id,
    userId: user.id,
    name: serverDisplayName(mine, user),
    nickname: mine?.nickname ?? null,
    displayName: user.display_name || user.username,
    self: true
  })
}

/** O menu que abre no nome do servidor. */
export function ServerMenuItems({
  server,
  access,
  onPicked
}: {
  server: Server | null
  access: ServerAccess
  onPicked: () => void
}): React.JSX.Element {
  const user = useAuthStore((s) => s.user)
  const openInviteModal = useUIStore((s) => s.openServerInviteModal)
  const openNotifyModal = useNotifySettingsStore((s) => s.openModal)
  const openConfirm = useChannelSidebarStore((s) => s.openConfirm)
  // O dono pode liberar a configuração dos eventos para um cargo sem dar nenhuma outra permissão.
  const canConfigureEvents = Boolean(useEventAccess(server?.id)?.configure)
  const items = serverMenuItems({
    hasServer: Boolean(server),
    canInvite: access.can(Perm.CREATE_INVITE),
    canChangeOwnNickname: Boolean(user && access.canChangeNickname(user.id)),
    canOpenSettings: canOpenServerSettings(access.perms, access.isOwner, canConfigureEvents),
    isOwner: access.isOwner
  })
  // Os itens que dependem do servidor só aparecem com ele (hasServer).
  const actions: Record<ServerMenuItem, () => void> = {
    invite: openInviteModal,
    nickname: () => server && user && askOwnNickname(server, user),
    events: () => server && useEventsPanelStore.getState().open(server.id),
    notifications: () => server && openNotifyModal({ serverId: server.id, name: server.name }),
    settings: () => useServerSettingsStore.getState().openSettings(),
    leave: () => openConfirm('leave'),
    delete: () => openConfirm('delete-server')
  }
  return (
    <div className="absolute top-14 left-3 right-3 z-30 flex flex-col rounded-xl border border-subtle bg-floating p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
      {server && (
        <ServerLevelCard
          serverId={server.id}
          onOpen={() => {
            onPicked()
            useServerLevelModalStore.getState().open(server.id)
          }}
        />
      )}
      {items.map((item) => (
        <SidebarMenuItem
          key={item}
          {...LOOK[item]}
          onClick={() => {
            onPicked()
            actions[item]()
          }}
        />
      ))}
    </div>
  )
}

/** Seta do menu do servidor; aberto, vira X (como no Discord). */
function MenuToggleIcon({ open }: { open: boolean }): React.JSX.Element {
  const Icon = open ? XIcon : ChevronDownIcon
  return <Icon size={16} className="shrink-0 text-muted" />
}

/** Nome do servidor no topo da barra; clicar abre o menu dele. */
function ServerHeaderMenu({
  server,
  access
}: {
  server: Server | null
  access: ServerAccess
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const name = server?.name ?? 'Servidor'
  const toggle = (): void => setOpen((d) => !d)
  return (
    <div className="relative flex h-14 shrink-0 items-center gap-1.5 px-4 border-b border-subtle shadow-xs">
      {/* O selo de nível é um botão próprio: não pode ficar dentro do botão do menu. */}
      <button
        onClick={toggle}
        title={name}
        aria-expanded={open}
        className={`min-w-0 text-left text-ds-md font-semibold text-strong hover:text-normal cursor-pointer ${
          server ? '' : 'flex-1'
        }`}
      >
        {/* Até duas linhas (o cabeçalho tem altura fixa); o resto no title. */}
        {server ? (
          <span className={`line-clamp-2 min-w-0 leading-5 ${WRAP_NAME}`}>{name}</span>
        ) : (
          // Sem servidor ainda (abrindo): o nome real entra no lugar da barra.
          <span className="flex h-5 min-w-0 items-center">
            <Skeleton className="h-3.5 w-3/5" />
            <span className="sr-only">Carregando servidor…</span>
          </span>
        )}
      </button>
      {server && <ServerLevelChip serverId={server.id} />}
      {/* Sobra da linha + seta: só estende a área de clique do botão do nome. */}
      <button
        type="button"
        onClick={toggle}
        tabIndex={-1}
        aria-hidden="true"
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center justify-end"
      >
        <MenuToggleIcon open={open} />
      </button>
      {open && <ServerMenuItems server={server} access={access} onPicked={() => setOpen(false)} />}
      <ServerLevelModal />
      <EventsPanelHost serverId={server?.id} />
    </div>
  )
}

export default ServerHeaderMenu
