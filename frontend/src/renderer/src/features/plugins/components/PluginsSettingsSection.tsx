import { useEffect } from 'react'
import { useServerStore } from '../../servers/store/serverStore'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { Perm } from '../../servers/lib/permissions'
import Button from '../../../shared/ui/Button'
import SectionHeader from '../../../shared/ui/SectionHeader'
import type { Plugin, ServerPlugin } from '../api/plugins'
import {
  availablePlugins,
  installAction,
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
  busy
}: {
  serverId: string
  plugin: ServerPlugin
  busy: PluginBusy
}): React.JSX.Element {
  return (
    <Row plugin={plugin}>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 whitespace-nowrap"
        disabled={busy.ids.has(plugin.id)}
        onClick={() => void busy.exclusive(plugin.id, () => uninstallAction(serverId, plugin.id))}
      >
        Desinstalar
      </Button>
    </Row>
  )
}

function InstalledList({
  serverId,
  list,
  busy
}: {
  serverId: string
  list: ServerPlugin[]
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
        <InstalledRow key={p.id} serverId={serverId} plugin={p} busy={busy} />
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
 * Configurações do servidor > Plugins, para quem gerencia o servidor: instalar e
 * desinstalar. Cada membro liga os seus pelo quebra-cabeça na barra do canal.
 * Uma coluna em qualquer largura.
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
    if (!serverId || !canManage) return
    void usePluginsStore.getState().load(serverId).catch(() => undefined)
    void usePluginsStore.getState().loadCatalog().catch(() => undefined)
  }, [serverId, canManage])

  if (!serverId || !canManage) return null

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeader as="h2">Instalados neste servidor</SectionHeader>
        <InstalledList serverId={serverId} list={list} busy={busy} />
        <p className="text-ds-xs text-muted">
          Instalar só deixa o plugin disponível. Cada membro liga o que quiser pelo quebra-cabeça na
          barra do canal.
        </p>
      </section>
      <AvailableList serverId={serverId} list={availablePlugins(catalog, list)} busy={busy} />
    </div>
  )
}
