import { useMemo, useState } from 'react'
import type { Server } from '../api/servers'
import { useAuthStore } from '../../auth/store/authStore'
import { Skeleton } from '../../../shared/ui/skeleton/Skeleton'
import { ChevronDownIcon, XIcon } from '../../../shared/ui/icons'
import { useServerStore } from '../store/serverStore'
import type { ServerAccess } from '../lib/serverAccess'
import { serverMenuContext, serverMenuItems, type ServerMenuItem } from '../lib/serverMenu'
import { SERVER_MENU_LOOK } from '../lib/serverMenuLook'
import { WRAP_NAME } from '../lib/voiceChannelRow'
import { useHideMutedLook } from '../hooks/useHideMutedLook'
import { useServerMenuActions } from '../hooks/useServerMenuActions'
import SidebarMenuItem from './SidebarMenuItem'
import ServerLevelCard from '../../serverlevel/components/ServerLevelCard'
import ServerLevelChip from '../../serverlevel/components/ServerLevelChip'
import EventsPanelHost from '../../events/components/EventsPanelHost'
import { useEventAccess } from '../../events/hooks/useEventAccess'
import ServerStripArt, { useServerStrip } from '../../serverprofile/components/ServerStripArt'

/** O menu que abre no nome do servidor (os itens vêm de `lib/serverMenu`, os mesmos do menu do ícone). */
export function ServerMenuItems({
  server,
  access,
  onPicked
}: {
  server: Server | null
  access: ServerAccess
  onPicked: () => void
}): React.JSX.Element {
  const userId = useAuthStore((s) => s.user?.id)
  const hideMuted = useHideMutedLook(server?.id)
  const members = useServerStore((s) => s.currentMembers)
  // O dono pode liberar a configuração dos eventos para um cargo sem dar nenhuma outra permissão.
  const canConfigureEvents = Boolean(useEventAccess(server?.id)?.configure)
  const data = useMemo(() => (server ? { server, members, access } : null), [server, members, access])
  const actions = useServerMenuActions(data)
  const items = serverMenuItems(
    serverMenuContext({ access: server ? access : null, userId, canConfigureEvents })
  )
  return (
    <div
      role="menu"
      className="absolute top-14 left-3 right-3 z-30 flex flex-col rounded-xl border border-subtle bg-floating p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2"
    >
      {server && (
        <ServerLevelCard
          serverId={server.id}
          onOpen={() => {
            onPicked()
            actions?.level()
          }}
        />
      )}
      {items.map((item) => (
        <SidebarMenuItem
          key={item}
          role="menuitem"
          {...SERVER_MENU_LOOK[item]}
          {...(item === 'hideMuted' ? hideMuted : {})}
          onClick={() => {
            onPicked()
            // Item que só existe no menu do ícone (mute, moveTo) nunca chega aqui.
            actions?.[item as Exclude<ServerMenuItem, 'mute' | 'moveTo'>]()
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
  const strip = useServerStrip(server?.id)
  return (
    <div
      className={`relative isolate z-20 flex shrink-0 gap-1.5 px-4 border-b border-subtle shadow-xs ${
        strip ? 'on-media h-24 items-start pt-3' : 'h-14 items-center'
      }`}
    >
      {strip && <ServerStripArt art={strip} />}
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
      <EventsPanelHost serverId={server?.id} />
    </div>
  )
}

export default ServerHeaderMenu
