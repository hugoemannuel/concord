import { showToast } from '../../../shared/store/toastStore'
import { actionErrorMessage } from '../../servers/lib/permissionErrors'
import type { Plugin, ServerPlugin } from '../api/plugins'
import { usePluginsStore } from '../store/pluginsStore'

/** O catálogo sem o que já está instalado (catálogo ainda não carregado = nada). */
export function availablePlugins(catalog: Plugin[] | null, installed: ServerPlugin[]): Plugin[] {
  const ids = new Set(installed.map((p) => p.id))
  return (catalog ?? []).filter((p) => !ids.has(p.id))
}

/** Roda a ação do store; se falhar, mostra o erro em vez de estourar. */
async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (err) {
    showToast.error(actionErrorMessage(err, 'Não foi possível concluir a ação.'))
  }
}

export const installAction = (serverId: string, pluginId: string): Promise<void> =>
  run(() => usePluginsStore.getState().install(serverId, pluginId))

export const uninstallAction = (serverId: string, pluginId: string): Promise<void> =>
  run(() => usePluginsStore.getState().uninstall(serverId, pluginId))

export const toggleAction = (serverId: string, pluginId: string, enabled: boolean): Promise<void> =>
  run(() => usePluginsStore.getState().toggle(serverId, pluginId, enabled))
