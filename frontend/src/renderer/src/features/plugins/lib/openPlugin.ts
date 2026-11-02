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
