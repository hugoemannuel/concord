import { useCallback, useEffect, useState } from 'react'
import type { ServerEvent } from '../api/events'
import { useEventsStore } from '../store/eventsStore'
import { startEventsWatch } from '../store/eventsWatch'

/**
 * Os eventos do servidor (undefined enquanto carrega), o erro de carga e como
 * tentar de novo. Liga o ws dos eventos na primeira vez.
 */
export function useEvents(serverId: string): {
  events: ServerEvent[] | undefined
  error: string | null
  reload: () => void
} {
  const events = useEventsStore((s) => s.byServer[serverId])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback((): void => {
    setError(null)
    useEventsStore
      .getState()
      .load(serverId)
      .catch(() => setError('Não foi possível carregar os eventos.'))
  }, [serverId])

  useEffect(() => {
    startEventsWatch()
    reload()
  }, [reload])

  return { events, error, reload }
}
