import { useEffect } from 'react'
import { useServerStore } from '../../servers/store/serverStore'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { Perm } from '../../servers/lib/permissions'
import Button from '../../../shared/ui/Button'
import SectionHeader from '../../../shared/ui/SectionHeader'
import Switch from '../../../shared/ui/Switch'
import type { Plugin, ServerPlugin } from '../api/plugins'
import {
  availablePlugins,
  installAction,
  toggleAction,
  uninstallAction
} from '../lib/pluginSettingsActions'
import { usePluginsStore } from '../store/pluginsStore'
import { usePluginBusy, type PluginBusy } from '../hooks/usePluginBusy'

const NO_PLUGINS: ServerPlugin[] = []

function Row({ plugin, children }: { plugin: Plugin; children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-subtle px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-ds-sm font-semibold text-strong">{plugin.name}</p>
        <p className="truncate text-ds-xs text-muted">{plugin.description}</p>
      </div>
      {children}
    </li>
  )
}

function InstalledRow({
  serverId,
  plugin,
  canManage,
  busy
}: {
  serverId: string
  plugin: ServerPlugin
  canManage: boolean
  busy: PluginBusy
}): React.JSX.Element {
  return (
    <Row plugin={plugin}>
      <Switch
        checked={plugin.enabled}
        label={plugin.name}
        disabled={busy.ids.has(plugin.id)}
        onChange={(on) => void busy.exclusive(plugin.id, () => toggleAction(serverId, plugin.id, on))}
      />
      {canManage && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 whitespace-nowrap"
          disabled={busy.ids.has(plugin.id)}
          onClick={() => void busy.exclusive(plugin.id, () => uninstallAction(serverId, plugin.id))}
        >
          Desinstalar
        </Button>
      )}
    </Row>
  )
}

function InstalledList({
  serverId,
  list,
  canManage,
  busy
}: {
  serverId: string
  list: ServerPlugin[]
  canManage: boolean
  busy: PluginBusy
}): React.JSX.Element {
  if (list.length === 0) {
    return (
      <p className="rounded-lg border border-subtle px-4 py-6 text-center text-ds-sm text-muted">
        Nenhum plugin instalado neste servidor ainda.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {list.map((p) => (
        <InstalledRow key={p.id} serverId={serverId} plugin={p} canManage={canManage} busy={busy} />
      ))}
    </ul>
  )
}

function AvailableList({
  serverId,
  list,
  busy
}: {
  serverId: string
  list: Plugin[]
  busy: PluginBusy
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader as="h2">Disponíveis</SectionHeader>
      <ul className="flex flex-col gap-2">
        {list.map((p) => (
          <Row key={p.id} plugin={p}>
            <Button
              size="sm"
              className="shrink-0 whitespace-nowrap"
              disabled={busy.ids.has(p.id)}
              onClick={() => void busy.exclusive(p.id, () => installAction(serverId, p.id))}
            >
              Instalar
            </Button>
          </Row>
        ))}
      </ul>
    </section>
  )
}

/**
 * Configurações do servidor > Plugins. Todo membro liga os plugins para si; quem
 * gerencia o servidor também instala e desinstala. Uma coluna em qualquer largura.
 */
export default function PluginsSettingsSection(): React.JSX.Element | null {
  const serverId = useServerStore((s) => s.currentServer?.id)
  const { perms, isOwner } = useServerAccess()
  // `perms` já vem com o Administrador somado (computeBase).
  const canManage = isOwner || (perms & Perm.MANAGE_SERVER) !== 0
  const list = usePluginsStore((s) => (serverId ? s.byServer[serverId] : undefined)) ?? NO_PLUGINS
  const catalog = usePluginsStore((s) => s.catalog)
  const busy = usePluginBusy()

  useEffect(() => {
    if (!serverId) return
    void usePluginsStore.getState().load(serverId).catch(() => undefined)
    if (canManage) void usePluginsStore.getState().loadCatalog().catch(() => undefined)
  }, [serverId, canManage])

  if (!serverId) return null

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeader as="h2">
          {canManage ? 'Instalados neste servidor' : 'Plugins deste servidor'}
        </SectionHeader>
        <InstalledList serverId={serverId} list={list} canManage={canManage} busy={busy} />
        <p className="text-ds-xs text-muted">
          {canManage
            ? 'Instalar só deixa o plugin disponível. Cada membro escolhe se quer usar.'
            : 'Ligue os que quiser ver na barra dos canais. Só muda para você.'}
        </p>
      </section>
      {canManage && <AvailableList serverId={serverId} list={availablePlugins(catalog, list)} busy={busy} />}
    </div>
  )
}
