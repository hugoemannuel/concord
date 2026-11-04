import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNow } from '../../../shared/hooks/useNow'
import { ServerRailSkeleton } from '../../../shared/ui/skeleton/layouts'
import { useServersVoiceActivity } from '../../call/hooks/useServersVoiceActivity'
import { voiceServerId, type VoiceMember } from '../../call/lib/voiceServer'
import { useCallStore } from '../../call/store/callStore'
import { useChatStore } from '../../chat/store/chatStore'
import { isMutedNow, type NotifySettings } from '../../notifications/lib/notificationMute'
import { useNotifySettingsStore } from '../../notifications/store/notifySettingsStore'
import type { Server } from '../api/servers'
import { useServerRailDrag, type ServerRailDrag } from '../hooks/useServerRailDrag'
import {
  folderRailView,
  reconcileRailLayout,
  resolveRailEntries,
  type ResolvedRailFolder
} from '../lib/serverRailLayout'
import { serverRailView, type ServerRailView } from '../lib/serverRailView'
import { useServerLayoutStore } from '../store/serverLayoutStore'
import { useServerStore } from '../store/serverStore'
import ServerFolderItem from './ServerFolderItem'
import ServerFolderModal from './ServerFolderModal'
import ServerRailContextMenu, { type RailContextTarget } from './ServerRailContextMenu'
import ServerRailItem from './ServerRailItem'

interface RailItemEnv {
  pathname: string
  voiceSrvId: string | null
  voiceActivity: Map<string, VoiceMember[]>
  unreadByServer: Record<string, number>
  mentionsByServer: Record<string, number>
  notifyServers: Record<string, NotifySettings>
  now: number
  drag: ServerRailDrag
  navigate: (path: string) => void
  openMenu: (target: RailContextTarget) => void
}

function buildServerView(srv: Server, env: RailItemEnv): { isActive: boolean; view: ServerRailView; people?: VoiceMember[] } {
  const isActive = env.pathname === `/servers/${srv.id}`
  const people = env.voiceActivity.get(srv.id)
  const view = serverRailView({
    muted: isMutedNow(env.notifyServers[srv.id], env.now),
    isActive,
    mentions: env.mentionsByServer[srv.id],
    unread: env.unreadByServer[srv.id],
    inMyCall: srv.id === env.voiceSrvId,
    hasCall: people !== undefined
  })
  return { isActive, view, people }
}

function renderFolderEntry(
  folder: ResolvedRailFolder,
  topIndex: number,
  collapsed: boolean,
  onToggle: () => void,
  env: RailItemEnv
): React.JSX.Element {
  const memberStates = folder.servers.map((srv) => ({ srv, ...buildServerView(srv, env) }))
  const anyActive = memberStates.some((m) => m.isActive)
  const view = folderRailView(
    memberStates.map((m) => m.view),
    anyActive
  )
  const folderSource = { kind: 'folder' as const, folderId: folder.id }

  return (
    <ServerFolderItem
      key={folder.id}
      name={folder.name}
      servers={folder.servers}
      collapsed={collapsed}
      anyActive={anyActive}
      view={view}
      dragging={env.drag.isDragging(folderSource)}
      dropZone={env.drag.topZone(topIndex)}
      dragProps={env.drag.topDragProps(folderSource, {
        kind: 'folder',
        topIndex,
        targetId: folder.id
      })}
      onToggle={onToggle}
      onContextMenu={(e) =>
        env.openMenu({
          kind: 'folder',
          folderId: folder.id,
          name: folder.name,
          x: e.clientX,
          y: e.clientY
        })
      }
    >
      {memberStates.map(({ srv, isActive, view: srvView, people }, memberIdx) => (
        <ServerRailItem
          key={srv.id}
          name={srv.name}
          iconUrl={srv.icon_url}
          isActive={isActive}
          view={srvView}
          people={people}
          dragging={env.drag.isDragging({ kind: 'server', serverId: srv.id, folderId: folder.id })}
          dropZone={env.drag.folderMemberZone(folder.id, memberIdx)}
          dragProps={env.drag.folderMemberDragProps(folder.id, memberIdx, srv.id)}
          onOpen={() => env.navigate(`/servers/${srv.id}`)}
          onContextMenu={(e) =>
            env.openMenu({
              kind: 'server',
              serverId: srv.id,
              name: srv.name,
              x: e.clientX,
              y: e.clientY
            })
          }
        />
      ))}
    </ServerFolderItem>
  )
}

/** Lista rolável dos servidores e pastas do usuário, com arrasto, selos de não lidas, voz e hover. */
function ServerRailList(): React.JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const [menuTarget, setMenuTarget] = useState<RailContextTarget | null>(null)

  const servers = useServerStore((s) => s.servers)
  const serversLoaded = useServerStore((s) => s.serversLoaded)
  const layoutItems = useServerLayoutStore((s) => s.items)
  const collapsedFolders = useServerLayoutStore((s) => s.collapsedFolders)
  const toggleFolder = useServerLayoutStore((s) => s.toggleFolder)
  const voiceSrvId = useCallStore((s) => voiceServerId(s))
  const voiceActivity = useServersVoiceActivity(servers.map((srv) => srv.id))
  const unreadByServer = useChatStore((s) => s.unreadByServer)
  const mentionsByServer = useChatStore((s) => s.mentionsByServer)
  const notifyServers = useNotifySettingsStore((s) => s.servers)
  const now = useNow()

  const reconciledItems = reconcileRailLayout(layoutItems, servers)
  const entries = resolveRailEntries(layoutItems, servers)
  const drag = useServerRailDrag(reconciledItems)

  const env: RailItemEnv = {
    pathname: location.pathname,
    voiceSrvId,
    voiceActivity,
    unreadByServer,
    mentionsByServer,
    notifyServers,
    now,
    drag,
    navigate,
    openMenu: setMenuTarget
  }

  return (
    <>
      <div
        onDragLeave={drag.clearOnLeave}
        className="-my-1 flex flex-col items-center gap-2 overflow-y-auto no-scrollbar px-2 py-2"
      >
        {!serversLoaded && servers.length === 0 && <ServerRailSkeleton />}
        {entries.map((entry, topIndex) => {
          if (entry.kind === 'folder') {
            return renderFolderEntry(
              entry,
              topIndex,
              Boolean(collapsedFolders[entry.id]),
              () => toggleFolder(entry.id),
              env
            )
          }
          const srv = entry.server
          const { isActive, view, people } = buildServerView(srv, env)
          const srvSource = { kind: 'server' as const, serverId: srv.id, folderId: null }
          return (
            <ServerRailItem
              key={srv.id}
              name={srv.name}
              iconUrl={srv.icon_url}
              isActive={isActive}
              view={view}
              people={people}
              dragging={drag.isDragging(srvSource)}
              dropZone={drag.topZone(topIndex)}
              dragProps={drag.topDragProps(srvSource, {
                kind: 'server',
                topIndex,
                targetId: srv.id
              })}
              onOpen={() => navigate(`/servers/${srv.id}`)}
              onContextMenu={(e) =>
                setMenuTarget({
                  kind: 'server',
                  serverId: srv.id,
                  name: srv.name,
                  x: e.clientX,
                  y: e.clientY
                })
              }
            />
          )
        })}
      </div>
      <ServerRailContextMenu
        target={menuTarget}
        items={reconciledItems}
        onClose={() => setMenuTarget(null)}
      />
      <ServerFolderModal servers={servers} reconciledItems={reconciledItems} />
    </>
  )
}

export default ServerRailList
