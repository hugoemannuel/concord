import { isActive, isMutedNow, type NotifySettings } from '../lib/notificationMute'
import { useChannelNameStore } from '../../servers/store/channelNameStore'
import { useNotifySettingsStore } from '../store/notifySettingsStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useNow } from '../../../shared/hooks/useNow'

function summary(s: NotifySettings, now: number): string {
  const parts: string[] = []
  if (isMutedNow(s, now)) parts.push('Silenciado')
  if (s.level === 'mentions') parts.push('Só @menções')
  if (s.level === 'nothing') parts.push('Nada')
  if (s.suppress_everyone) parts.push('Ignora @all e @here')
  if (s.suppress_roles) parts.push('Ignora menções de cargo')
  return parts.join(' · ')
}

/** Configurações → Notificações: servidores e canais com mute ou nível próprio. */
export default function MutedNotifications(): React.JSX.Element | null {
  const now = useNow()
  const servers = useNotifySettingsStore((s) => s.servers)
  const channels = useNotifySettingsStore((s) => s.channels)
  const openModal = useNotifySettingsStore((s) => s.openModal)
  const serverList = useServerStore((s) => s.servers)
  const namesByServer = useChannelNameStore((s) => s.byServer)

  const serverRows = Object.entries(servers)
    .filter(([, s]) => isActive(s, now))
    .map(([id, s]) => ({ id, s, name: serverList.find((x) => x.id === id)?.name }))
    .filter((r): r is typeof r & { name: string } => !!r.name)

  const channelRows = Object.entries(channels)
    .filter(([, s]) => isActive(s, now))
    .flatMap(([id, s]) => {
      const serverId = Object.keys(namesByServer).find((sid) => namesByServer[sid]?.[id])
      if (!serverId) return []
      const server = serverList.find((x) => x.id === serverId)
      return [{ id, s, serverId, name: `#${namesByServer[serverId][id]}`, server: server?.name }]
    })

  if (serverRows.length === 0 && channelRows.length === 0) return null

  return (
    <div className="mt-4 rounded-xl border border-subtle bg-fg/5 p-4">
      <h3 className="mb-3 text-ds-sm font-semibold text-strong">Silenciados e personalizados</h3>
      <ul className="flex flex-col gap-1">
        {serverRows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
            <div className="min-w-0">
              <div className="truncate text-ds-sm text-normal">{r.name}</div>
              <div className="text-ds-xs text-faint">{summary(r.s, now)}</div>
            </div>
            <button
              type="button"
              onClick={() => openModal({ serverId: r.id, name: r.name })}
              className="shrink-0 cursor-pointer rounded-md bg-fg/10 px-3 py-1 text-ds-sm text-normal hover:bg-fg/20"
            >
              Editar
            </button>
          </li>
        ))}
        {channelRows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
            <div className="min-w-0">
              <div className="truncate text-ds-sm text-normal">
                {r.name}
                {r.server && <span className="text-faint"> · {r.server}</span>}
              </div>
              <div className="text-ds-xs text-faint">{summary(r.s, now)}</div>
            </div>
            <button
              type="button"
              onClick={() =>
                openModal({ serverId: r.serverId, channelId: r.id, name: r.name.slice(1) })
              }
              className="shrink-0 cursor-pointer rounded-md bg-fg/10 px-3 py-1 text-ds-sm text-normal hover:bg-fg/20"
            >
              Editar
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
