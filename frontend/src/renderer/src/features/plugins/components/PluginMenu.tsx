import type { ServerPlugin } from '../api/plugins'
import Switch from '../../../shared/ui/Switch'
import type { PluginBusy } from '../hooks/usePluginBusy'
import { menuToggle } from '../lib/pluginSettingsActions'

const NAME = 'min-w-0 truncate text-left text-ds-sm font-semibold text-strong'

function PluginName({
  plugin,
  onOpen
}: {
  plugin: ServerPlugin
  onOpen: (p: ServerPlugin) => void
}): React.JSX.Element {
  if (!plugin.enabled) return <p className={NAME}>{plugin.name}</p>
  return (
    <button
      type="button"
      onClick={() => onOpen(plugin)}
      className={`focus-ring rounded hover:underline ${NAME}`}
    >
      {plugin.name}
    </button>
  )
}

/**
 * Menu do quebra-cabeça na barra do canal: os plugins instalados no servidor, cada um
 * com o interruptor (só para quem clica). O nome de um plugin ligado abre o painel.
 * É um popover (`dialog`), não um `menu`: tem interruptores e texto, e se navega com Tab.
 * O `busy` vem de quem abre: fechar e reabrir não libera um pedido ainda no ar.
 */
export default function PluginMenu({
  serverId,
  plugins,
  busy,
  onOpen
}: {
  serverId: string
  plugins: ServerPlugin[]
  busy: PluginBusy
  onOpen: (p: ServerPlugin) => void
}): React.JSX.Element {
  return (
    <div
      role="dialog"
      aria-label="Plugins"
      className="absolute right-4 top-14 z-50 flex max-h-[calc(100dvh-6rem)] w-72 max-w-[calc(100vw-2rem)] flex-col gap-1 overflow-y-auto rounded-xl border border-subtle bg-accent p-1 shadow-2xl"
    >
      {plugins.map((p) => (
        <div key={p.id} className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <PluginName plugin={p} onOpen={onOpen} />
            <p className="truncate text-ds-xs text-muted">{p.description}</p>
          </div>
          <Switch
            checked={p.enabled}
            label={p.name}
            disabled={busy.ids.has(p.id)}
            onChange={(on) => void menuToggle(busy.exclusive, serverId, p.id, on)}
          />
        </div>
      ))}
    </div>
  )
}
