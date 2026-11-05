import { showToast } from '../../../shared/store/toastStore'
import { permissionError } from '../../servers/lib/permissions'
import type { Plugin, ServerPlugin } from '../api/plugins'
import { usePluginsStore } from '../store/pluginsStore'

/**
 * As fichas aprovadas que ainda não estão instaladas (catálogo ainda não carregado = nada).
 * O time recebe também as pendentes e recusadas no catálogo, mas essas não podem ser instaladas.
 */
export function availablePlugins(catalog: Plugin[] | null, installed: ServerPlugin[]): Plugin[] {
  const ids = new Set(installed.map((p) => p.id))
  return (catalog ?? []).filter((p) => p.status === 'approved' && !ids.has(p.id))
}

const FALLBACK = 'Não foi possível concluir a ação.'

/** Só texto do app: a mensagem de permissão do código, ou o genérico; nunca a do backend. */
function errorText(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code
  return permissionError(typeof code === 'string' ? code : undefined, FALLBACK)
}

/** Roda a ação do store; se falhar, mostra o erro em vez de estourar. */
async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (err) {
    showToast.error(errorText(err))
  }
}

export const installAction = (serverId: string, pluginId: string): Promise<void> =>
  run(() => usePluginsStore.getState().install(serverId, pluginId))

export const uninstallAction = (serverId: string, pluginId: string): Promise<void> =>
  run(() => usePluginsStore.getState().uninstall(serverId, pluginId))

export const toggleAction = (serverId: string, pluginId: string, enabled: boolean): Promise<void> =>
  run(() => usePluginsStore.getState().toggle(serverId, pluginId, enabled))

/**
 * Roda `fn` só se o plugin não tem pedido em andamento: marca em `held`, avisa quem
 * desenha (`notify`) e solta no `finally`, com sucesso ou falha. Id ocupado é ignorado.
 */
export async function runExclusive(
  held: Set<string>,
  id: string,
  notify: (busy: Set<string>) => void,
  fn: () => Promise<void>
): Promise<void> {
  if (held.has(id)) return
  held.add(id)
  notify(new Set(held))
  try {
    await fn()
  } finally {
    held.delete(id)
    notify(new Set(held))
  }
}

/** O interruptor do menu da barra: liga/desliga sem repetir o pedido em andamento. */
export const menuToggle = (
  exclusive: (id: string, fn: () => Promise<void>) => Promise<void>,
  serverId: string,
  pluginId: string,
  enabled: boolean
): Promise<void> => exclusive(pluginId, () => toggleAction(serverId, pluginId, enabled))
