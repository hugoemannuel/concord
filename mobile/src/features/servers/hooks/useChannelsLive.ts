import { useEffect } from 'react'
import { onRealtimeReconnect } from '../../../shared/api/realtime'
import { onWsEvent } from '../../../shared/api/ws'
import { useAuthStore } from '../../auth/store/authStore'
import { useServersStore } from '../store/serversStore'

const CHANNEL_EVENTS = new Set([
  'channel:create',
  'channel:update',
  'channel:delete',
  'channel:reorder',
  'category:changed',
  // Canal ou categoria que virou privada: quem perdeu o acesso deixa de ver na hora.
  'server:permissions:invalidate'
])

/**
 * Mantém a lista de canais em dia com o que acontece no servidor (canal criado, renomeado, apagado ou
 * reordenado, categoria mudada, inclusive por permissão): recarrega só os servidores cujos canais o app já tem. A sala
 * `server:<id>` é assinada em useUnreadLive.
 */
export function useChannelsLive(): void {
  const signedIn = useAuthStore((s) => s.status === 'signedIn')

  useEffect(() => {
    if (!signedIn) return
    const loadKnown = (): void => {
      const { channelsByServer, loadChannels } = useServersStore.getState()
      Object.keys(channelsByServer).forEach((serverId) => void loadChannels(serverId))
    }
    const offEvents = onWsEvent((event) => {
      const serverId = (event.payload as { server_id?: string } | null)?.server_id
      if (!CHANNEL_EVENTS.has(event.type) || !serverId) return
      const { channelsByServer, loadChannels } = useServersStore.getState()
      if (channelsByServer[serverId] !== undefined) void loadChannels(serverId)
    })
    const offReconnect = onRealtimeReconnect(loadKnown)
    return () => {
      offEvents()
      offReconnect()
    }
  }, [signedIn])
}
