import type { ServerPlugin } from '../api/plugins'

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
  // Todos os ligados, não só os que têm ícone: o 3º em diante abre pelo menu.
  return list.find((p) => p.enabled && p.id === open.pluginId)
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
