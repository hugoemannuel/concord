import { useCallback, useEffect, useReducer, useRef } from 'react'
import { fetchAuditLog } from '../api/auditLog'
import { INITIAL_AUDIT_LIST, auditListReducer, type AuditFilter, type AuditListState } from '../lib/auditPages'

export interface AuditLog extends AuditListState {
  /** Próxima página (ignora se já carrega ou acabou). */
  loadMore: () => void
  /** Tenta de novo a página que falhou. */
  retry: () => void
}

/**
 * O registro de auditoria do servidor com rolagem infinita. Trocar de servidor
 * ou de filtro recomeça do mais recente; a resposta de um filtro antigo que
 * chegue atrasada é descartada.
 */
export function useAuditLog(serverId: string | undefined, filter: AuditFilter): AuditLog {
  const [state, dispatch] = useReducer(auditListReducer, INITIAL_AUDIT_LIST)
  const generation = useRef(0)
  const { actorId, action } = filter

  const load = useCallback(
    (before: number | null, reset: boolean) => {
      if (!serverId) return
      const mine = reset ? ++generation.current : generation.current
      dispatch({ type: 'start', reset })
      fetchAuditLog(serverId, { actorId, action }, before)
        .then((page) => {
          if (mine === generation.current) dispatch({ type: 'page', entries: page.entries, next: page.next_before })
        })
        .catch(() => {
          if (mine === generation.current) dispatch({ type: 'fail' })
        })
    },
    [serverId, actorId, action]
  )

  useEffect(() => load(null, true), [load])

  const { next, loading, entries } = state
  const loadMore = useCallback(() => {
    if (next !== null && !loading) load(next, false)
  }, [next, loading, load])
  const retry = useCallback(() => load(entries.length ? next : null, entries.length === 0), [entries.length, next, load])

  return { ...state, loadMore, retry }
}
