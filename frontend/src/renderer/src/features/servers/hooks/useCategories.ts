import { useCallback, useEffect, useRef, useState } from 'react'
import { listCategories, type CategoryLayout } from '../api/categories'
import { onWsEvent } from '../../../shared/api/ws'
import { showToast } from '../../../shared/store/toastStore'
import { useConnectionStore } from '../../../shared/store/connectionStore'

function normalize(data: CategoryLayout): CategoryLayout {
  return { categories: data.categories ?? [], channels: data.channels ?? [] }
}

export function useCategories(serverId: string, channelIds: string): {
  layout: CategoryLayout | null
  refresh: () => Promise<void>
  run: (operation: () => Promise<void>) => Promise<boolean>
} {
  const [loaded, setLoaded] = useState<{ serverId: string; layout: CategoryLayout } | null>(null)
  const latest = useRef(0)
  const phase = useConnectionStore((state) => state.ws.phase)
  const refresh = useCallback(async () => {
    if (!serverId) return
    const sequence = ++latest.current
    await listCategories(serverId).then(
      (data) => { if (sequence === latest.current) setLoaded({ serverId, layout: normalize(data) }) },
      () => { if (sequence === latest.current) showToast.error('Não foi possível carregar as categorias.') }
    )
  }, [serverId])
  useEffect(() => {
    void refresh()
    return () => { latest.current++ }
  }, [refresh, channelIds])
  useEffect(() => { if (phase === 'open') void refresh() }, [phase, refresh])
  useEffect(() => onWsEvent((event) => {
    if (event.type === 'category:changed' && (event.payload as { server_id?: string })?.server_id === serverId) void refresh()
  }), [refresh, serverId])
  const run = useCallback(async (operation: () => Promise<void>): Promise<boolean> => {
    try { await operation(); await refresh(); return true }
    catch { showToast.error('Não foi possível alterar as categorias.'); return false }
  }, [refresh])
  return { layout: loaded?.serverId === serverId ? loaded.layout : null, refresh, run }
}
