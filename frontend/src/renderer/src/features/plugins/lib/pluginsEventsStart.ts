import { onWsEvent } from '../../../shared/api/ws'
import { usePluginsStore } from '../store/pluginsStore'

/**
 * plugins:changed (instalar, desinstalar, revisar ou o meu liga/desliga em
 * outro aparelho): recarrega a lista, mas só dos servidores já carregados.
 */
export function startPluginsEvents(): () => void {
  return onWsEvent((event) => {
    if (event.type !== 'plugins:changed') return
    const serverId = (event.payload as { server_id?: string } | null)?.server_id
    const { byServer, load } = usePluginsStore.getState()
    if (serverId && serverId in byServer) void load(serverId)
  })
}
