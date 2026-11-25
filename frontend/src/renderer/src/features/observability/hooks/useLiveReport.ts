import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/client'
import { fetchLiveReport, type LiveReport } from '../api/observability'

export type ReportState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; report: LiveReport }

/** Falha ao carregar: 403 = não é dev; o resto, erro (com "tentar de novo"). */
export function failedState(err: unknown): ReportState {
  return err instanceof ApiError && err.status === 403
    ? { status: 'forbidden' }
    : { status: 'error' }
}

/** O painel dos últimos `days` dias (null = ainda não buscar); 403 = não é dev. */
export function useLiveReport(days: number | null): { state: ReportState; reload: () => void } {
  const [state, setState] = useState<ReportState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (days === null) return
    let cancelled = false
    setState({ status: 'loading' })
    fetchLiveReport(days)
      .then((report) => !cancelled && setState({ status: 'ready', report }))
      .catch((err: unknown) => {
        if (!cancelled) setState(failedState(err))
      })
    return () => {
      cancelled = true
    }
  }, [days, version])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { state, reload }
}
