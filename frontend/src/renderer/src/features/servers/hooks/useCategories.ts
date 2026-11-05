import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listCategories, type CategoryLayout } from '../api/categories'
import { createCategoryLayoutSaver } from '../lib/categoryLayoutSaver'
import { applyTreeToLayout, type LayoutTree } from '../lib/channelLayoutTree'
import { layoutSaveErrorText } from '../lib/layoutSaveQueue'
import { onWsEvent } from '../../../shared/api/ws'
import { showToast } from '../../../shared/store/toastStore'
import { useConnectionStore } from '../../../shared/store/connectionStore'

// Mudança de permissão também muda a lista: categoria que some ou aparece, canal
// que deixa de estar vinculado.
const RELOAD_EVENTS = new Set(['category:changed', 'server:permissions:invalidate'])

function normalize(data: CategoryLayout): CategoryLayout {
  return { ...data, categories: data.categories ?? [], channels: data.channels ?? [] }
}

export function useCategories(serverId: string, channelIds: string): {
  layout: CategoryLayout | null
  /** A organização não veio: a barra mostra os canais soltos, em vez de carregar para sempre. */
  failed: boolean
  refresh: () => Promise<void>
  run: (operation: () => Promise<void>) => Promise<boolean>
  /** Mostra a nova organização na hora e grava; recusada, volta e avisa. */
  saveLayout: (tree: LayoutTree) => void
} {
  const [loaded, setLoaded] = useState<{ serverId: string; layout: CategoryLayout } | null>(null)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const latest = useRef(0)
  const phase = useConnectionStore((state) => state.ws.phase)
  const saver = useMemo(() => createCategoryLayoutSaver(serverId), [serverId])
  const refresh = useCallback(async () => {
    if (!serverId) return
    const sequence = ++latest.current
    await listCategories(serverId).then(
      (data) => {
        if (sequence !== latest.current) return
        const layout = normalize(data)
        saver.confirm(layout)
        setLoaded({ serverId, layout })
        setFailedFor(null)
      },
      () => {
        if (sequence !== latest.current) return
        setFailedFor(serverId)
        showToast.error('Não foi possível carregar as categorias.')
      }
    )
  }, [serverId, saver])
  // Com gravação no ar, ler agora traria a lista de antes e desfaria o que está
  // na tela. Não se perde nada: ao terminar (ou falhar), a gravação lê de novo.
  const sync = useCallback(() => {
    if (!saver.busy()) void refresh()
  }, [saver, refresh])
  useEffect(() => {
    sync()
    return () => { latest.current++ }
  }, [sync, channelIds])
  useEffect(() => { if (phase === 'open') sync() }, [phase, sync])
  useEffect(() => onWsEvent((event) => {
    if (RELOAD_EVENTS.has(event.type) && (event.payload as { server_id?: string })?.server_id === serverId) sync()
  }), [sync, serverId])
  const run = useCallback(async (operation: () => Promise<void>): Promise<boolean> => {
    try { await operation(); await refresh(); return true }
    catch { showToast.error('Não foi possível alterar as categorias.'); return false }
  }, [refresh])
  const current = loaded?.serverId === serverId ? loaded.layout : null
  const saveLayout = (tree: LayoutTree): void => {
    if (!current) return
    const next = applyTreeToLayout(current, tree)
    latest.current++
    setLoaded({ serverId, layout: next })
    saver.submit(next, {
      onIdle: () => { void refresh() },
      onFailed: (confirmed, err) => {
        if (confirmed) setLoaded({ serverId, layout: confirmed })
        showToast.error(layoutSaveErrorText(err))
        void refresh()
      }
    })
  }
  return { layout: current, failed: failedFor === serverId, refresh, run, saveLayout }
}
