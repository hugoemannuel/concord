import type { ServerPlugin } from '../api/plugins'
import { headerPlugins } from './headerPlugins'

export interface OpenPlugin {
  serverId: string
  pluginId: string
}

/** O plugin aberto só vale no servidor em que abriu e enquanto continua ligado. */
export function findOpenPlugin(
  open: OpenPlugin | null,
  serverId: string | undefined,
  list: ServerPlugin[]
): ServerPlugin | undefined {
  if (!open || open.serverId !== serverId) return undefined
  return headerPlugins(list).find((p) => p.id === open.pluginId)
}

/**
 * O estado `open` limpo quando o painel fechou sozinho (desinstalado, desligado, retirado ou
 * outro servidor): sem isso o iframe reabriria se o plugin voltasse. Igual = mesmo objeto.
 */
export function pruneOpen(
  open: OpenPlugin | null,
  serverId: string | undefined,
  list: ServerPlugin[]
): OpenPlugin | null {
  return findOpenPlugin(open, serverId, list) ? open : null
}
