import { useEffect } from 'react'
import type { EventAccess } from '../api/events'
import { useEventAccessStore } from '../store/eventAccessStore'
import { startEventsWatch } from '../store/eventsWatch'

/**
 * O que a pessoa pode fazer com os eventos do servidor (undefined até carregar).
 * Busca ao montar e acompanha as mudanças que o dono faz na configuração.
 */
export function useEventAccess(serverId: string | undefined): EventAccess | undefined {
  const access = useEventAccessStore((s) => (serverId ? s.byServer[serverId] : undefined))
  useEffect(() => {
    if (!serverId) return
    startEventsWatch()
    void useEventAccessStore.getState().load(serverId)
  }, [serverId])
  return access
}
