import { useEffect } from 'react'
import { onWsEvent } from '../../../shared/api/ws'
import { useConnectionStore } from '../../../shared/store/connectionStore'
import { listActiveServerCalls } from '../api/calls'
import { callsByChannel, type ServerCalls } from '../lib/voiceList'
import { useCallStore } from '../store/callStore'

/** Lê a lista dos canais de voz de um servidor e põe no callStore (só as dele). */
export async function loadServerCalls(serverId: string): Promise<ServerCalls | null> {
  try {
    const calls = callsByChannel(await listActiveServerCalls(serverId))
    useCallStore.getState().setServerCalls(serverId, calls)
    return calls
  } catch {
    return null // a próxima reconexão lê de novo
  }
}

/**
 * Lê uma vez a lista dos canais de voz de cada servidor: ao mudar a lista de
 * servidores e quando o WebSocket (re)abre. Com ele aberto, os eventos
 * call:channel_* mantêm a lista em dia; o que se perdeu na queda volta aqui.
 * Permissões mudaram num servidor (canal ficou visível ou oculto): relê ele.
 */
export function useServerCallsLoad(serverIds: string[]): void {
  const key = serverIds.join(',')
  const wsOpen = useConnectionStore((s) => s.ws.phase === 'open')

  useEffect(() => {
    if (!key || !wsOpen) return
    const ids = key.split(',')
    ids.forEach((id) => void loadServerCalls(id))
    return onWsEvent((event) => {
      if (event.type !== 'server:permissions:invalidate') return
      const serverId = (event.payload as { server_id?: string } | null)?.server_id
      if (serverId && ids.includes(serverId)) void loadServerCalls(serverId)
    })
  }, [key, wsOpen])
}
