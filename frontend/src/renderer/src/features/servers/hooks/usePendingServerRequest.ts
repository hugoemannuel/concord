import { useEffect } from 'react'
import { settlePending } from '../lib/pendingServerRequest'
import { useServerMenuStore } from '../store/serverMenuStore'
import { useServerStore } from '../store/serverStore'

/**
 * Roda o pedido que o menu do ícone deixou para um servidor que ainda não
 * estava aberto, assim que ele abre e carrega (uma vez só).
 */
export function usePendingServerRequest(): void {
  const pending = useServerMenuStore((s) => s.pending)
  const openId = useServerStore((s) => s.currentServer?.id)
  const loading = useServerStore((s) => s.loading)

  useEffect(() => {
    const clear = (): void => useServerMenuStore.getState().clearPending()
    settlePending(pending, { serverId: openId, loading }, Date.now(), clear)?.()
  }, [pending, openId, loading])
}
