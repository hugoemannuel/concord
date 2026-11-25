import { useCallback, useEffect, useState } from 'react'
import { fetchAlertReport, type AlertReport } from '../api/alerts'
import { stateForKey } from '../lib/stateForKey'
import { failedState } from './useLiveReport'

export type AlertReportState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; report: AlertReport }

const LOADING: AlertReportState = { status: 'loading' }

/** Os alertas dos últimos `days` dias; 403 = não é dev. */
export function useAlertReport(days: number): { state: AlertReportState; reload: () => void } {
  const [entry, setEntry] = useState<{ key: string; state: AlertReportState } | null>(null)
  const [version, setVersion] = useState(0)
  const key = `${days}:${version}`
  useEffect(() => {
    let cancelled = false
    const done = (state: AlertReportState): void => {
      if (!cancelled) setEntry({ key, state })
    }
    fetchAlertReport(days)
      .then((report) => done({ status: 'ready', report }))
      .catch((err: unknown) => done(failedState(err)))
    return () => {
      cancelled = true
    }
  }, [days, key])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { state: stateForKey(entry, key, LOADING), reload }
}
