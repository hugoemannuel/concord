import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../../shared/api/client'
import { fetchLiveReport, type LiveReport } from '../api/observability'
import { stateForKey } from '../lib/stateForKey'

export type ReportState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; report: LiveReport }

/** Falha ao carregar: 403 = não é dev; o resto, erro (com "tentar de novo"). */
export function failedState(err: unknown): { status: 'forbidden' } | { status: 'error' } {
  return err instanceof ApiError && err.status === 403
    ? { status: 'forbidden' }
    : { status: 'error' }
}

const LOADING: ReportState = { status: 'loading' }

/** O painel dos últimos `days` dias (null = ainda não buscar); 403 = não é dev. */
export function useLiveReport(days: number | null): { state: ReportState; reload: () => void } {
  const [entry, setEntry] = useState<{ key: string; state: ReportState } | null>(null)
  const [version, setVersion] = useState(0)
  const key = `${days}:${version}`
  useEffect(() => {
    if (days === null) return
    let cancelled = false
    const done = (state: ReportState): void => {
      if (!cancelled) setEntry({ key, state })
    }
    fetchLiveReport(days)
      .then((report) => done({ status: 'ready', report }))
      .catch((err: unknown) => done(failedState(err)))
    return () => {
      cancelled = true
    }
  }, [days, key])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { state: stateForKey(entry, key, LOADING), reload }
}
