import { useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../../auth/store/authStore'
import type { Channel, ChannelType } from '../api/channels'
import type { Server } from '../api/servers'
import { useServerStore } from '../store/serverStore'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import { useServerAccess } from '../hooks/useServerAccess'
import { useChannelMenuDismiss } from '../hooks/useChannelMenuDismiss'
import { useServerCallsSync } from '../hooks/useServerCallsSync'
import { useJoinVoiceChannel } from '../hooks/useJoinVoiceChannel'
import { useCategories } from '../hooks/useCategories'
import type { PlacedChannel } from '../hooks/useSidebarLayout'
import { Perm } from '../lib/permissions'
import type { ServerAccess } from '../lib/serverAccess'
import { canOpenChannelMenu, sidebarSections, type SidebarSections } from '../lib/channelSidebar'
import { categoryMenuMove } from '../lib/categoryLayout'
import SidebarFooter from '../../../app/SidebarFooter'
import ResizeHandle from '../../../shared/ui/ResizeHandle'
import { useResizableWidth } from '../../../shared/hooks/useResizableWidth'
import ServerHeaderMenu from './ServerHeaderMenu'
import ChannelSection from './ChannelSection'
import { ChannelMenuButton, ChannelMenuHost } from './ChannelMenu'
import TextChannelRow from './TextChannelRow'
import VoiceChannelRow from './VoiceChannelRow'
import SidebarDialogs from './SidebarDialogs'
import { CategoryPanel, type MoveChannel } from './CategoryPanel'

/** O que as linhas de canal das duas seções compartilham. */
interface ChannelListProps {
  serverId: string
  sections: SidebarSections
  access: ServerAccess
  /** Mover para cima/baixo no menu (dentro do tipo, no grupo do canal). */
  move: (type: ChannelType, from: number, to: number) => void
  menuRef: React.Ref<HTMLDivElement>
  categoryControls?: React.ReactNode
}

/** Menu do canal: "•••", botão direito e o próprio menu (cada item se esconde sem permissão). */
function useChannelMenuProps(
  { serverId, sections, access, move, menuRef, categoryControls }: ChannelListProps,
  ch: Channel,
  type: ChannelType
): {
  canOpen: boolean
  onContextMenu?: (e: React.MouseEvent) => void
  menu: React.ReactNode
} {
  const openMenu = useChannelSidebarStore((s) => s.openMenu)
  const canOpen = canOpenChannelMenu(
    ch,
    access.can(Perm.MANAGE_CHANNELS),
    access.canInChannel(ch.id, Perm.MANAGE_ROLES)
  )
  return {
    canOpen,
    // Botão direito no canal abre o mesmo menu do "•••".
    onContextMenu: canOpen
      ? (e) => {
          e.preventDefault()
          openMenu(ch.id)
        }
      : undefined,
    menu: (
      <ChannelMenuHost
        serverId={serverId}
        channel={ch}
        section={sections[type]}
        primaryId={sections.primaryId}
        access={access}
        move={move}
        menuRef={menuRef}
        categoryControls={categoryControls}
      />
    )
  }
}

function TextChannelItem({
  list,
  ch
}: {
  list: ChannelListProps
  ch: Channel
}): React.JSX.Element {
  const { channelId } = useParams<{ channelId: string }>()
  const menu = useChannelMenuProps(list, ch, 'text')
  return (
    <TextChannelRow
      serverId={list.serverId}
      channel={ch}
      active={ch.id === channelId}
      isPrivate={list.access.isPrivate(ch.id)}
      isPrimary={ch.id === list.sections.primaryId}
      onContextMenu={menu.onContextMenu}
      menuButton={menu.canOpen ? <ChannelMenuButton channelId={ch.id} /> : undefined}
      menu={menu.menu}
    />
  )
}

function VoiceChannelItem({
  list,
  ch,
  onJoin
}: {
  list: ChannelListProps
  ch: Channel
  onJoin: (ch: Channel) => void
}): React.JSX.Element {
  const menu = useChannelMenuProps(list, ch, 'voice')
  return (
    <VoiceChannelRow
      channel={ch}
      access={list.access}
      onJoin={() => onJoin(ch)}
      onContextMenu={menu.onContextMenu}
      renderMenuButton={
        menu.canOpen
          ? (onHover) => <ChannelMenuButton channelId={ch.id} onHover={onHover} />
          : undefined
      }
      menu={menu.menu}
    />
  )
}

/** As duas seções de canais (texto e voz) do servidor aberto. */
function ChannelLists({
  server,
  access
}: {
  server: Server | null
  access: ServerAccess
}): React.JSX.Element {
  const serverId = server?.id ?? ''
  const channels = useServerStore((s) => s.channels)
  const loadedFor = useServerStore((s) => s.channelsLoadedFor)
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const openCreate = useChannelSidebarStore((s) => s.openCreate)
  const menuRef = useRef<HTMLDivElement>(null)
  useChannelMenuDismiss(menuRef)
  const sections = sidebarSections(server, channels, loadedFor)
  const canManage = access.can(Perm.MANAGE_CHANNELS)
  const categories = useCategories(serverId, channels.map((channel) => channel.id).join(','))
  const onJoin = useJoinVoiceChannel(access, server?.id)
  const renderChannel = (
    ch: Channel,
    group: PlacedChannel[],
    categoryControls: React.ReactNode,
    moveChannel: MoveChannel
  ): React.ReactNode => {
    const groupedSections = { ...sections, text: group.filter((item) => item.type === 'text'), voice: group.filter((item) => item.type === 'voice') }
    const list: ChannelListProps = {
      serverId, access, menuRef, categoryControls, sections: groupedSections,
      move: (type, from, to) => {
        const step = categoryMenuMove(group, groupedSections[type], from, to)
        if (step) moveChannel(step)
      }
    }
    return ch.type === 'voice' ? <VoiceChannelItem list={list} ch={ch} onJoin={onJoin} /> : <TextChannelItem list={list} ch={ch} />
  }
  return (
    <div data-dnd="list" className="flex-1 overflow-y-auto overscroll-contain px-2 py-3">
      <CategoryPanel serverId={serverId} userId={userId} layout={categories.layout} channels={sections.ready ? channels : []} canManage={canManage && Boolean(serverId)} run={categories.run} saveLayout={categories.saveLayout}
        onCreateChannel={openCreate}
        renderChannel={renderChannel}
        fallback={(onCreateCategory, ungrouped, renderRows, sectionDrop) => {
          const text = ungrouped.filter((channel) => (channel.type ?? 'text') === 'text')
          const voice = ungrouped.filter((channel) => channel.type === 'voice')
          return <>
            <ChannelSection
              title="Canais de texto"
              addLabel="Criar canal de texto"
              onAdd={canManage ? () => openCreate('text') : undefined}
              onAddCategory={onCreateCategory}
              ready={sections.ready}
              count={text.length}
              emptyText="Nenhum canal ainda."
              skeleton={{ count: 6 }}
              {...sectionDrop('text')}
            >
              {renderRows(text)}
            </ChannelSection>
            <ChannelSection
              title="Canais de voz"
              addLabel="Criar canal de voz"
              onAdd={canManage ? () => openCreate('voice') : undefined}
              onAddCategory={onCreateCategory}
              ready={sections.ready}
              count={voice.length}
              emptyText="Nenhum canal de voz ainda."
              skeleton={{ count: 3, offset: 4 }}
              {...sectionDrop('voice')}
            >
              {renderRows(voice)}
            </ChannelSection>
          </>
        }} />
    </div>
  )
}

/** Barra de canais do servidor: cabeçalho com o menu, canais de texto e de voz e o rodapé. */
export function ServerSidebar(): React.JSX.Element {
  const server = useServerStore((s) => s.currentServer)
  // Quem pode o quê vem dos cargos; o servidor confere de novo a cada ação.
  const access = useServerAccess()
  // Mesma preferência de largura na barra de canais e na de DMs/amigos.
  const sidebar = useResizableWidth('channels')
  // A sala do servidor (eventos, menções, não lidas) é assinada pela
  // ServerRail para todos os servidores — sair desta tela não a cancela.
  useServerCallsSync(server?.id)

  return (
    <>
      {/* z-10: a alça de redimensionar passa um pouco da borda, sobre o conteúdo. */}
      <aside
        style={sidebar.panelStyle}
        className="relative z-10 flex h-full shrink-0 flex-col border-r border-subtle bg-secondary backdrop-blur-2xl"
      >
        <ResizeHandle {...sidebar.handleProps} />
        <ServerHeaderMenu server={server} access={access} />
        <ChannelLists server={server} access={access} />
        {/* "Voz conectada" na chamada + a barra do usuário (igual em todas as telas) */}
        <SidebarFooter />
      </aside>
      {server && <SidebarDialogs server={server} />}
    </>
  )
}

export default ServerSidebar
