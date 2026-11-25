import { useCallback, useEffect, useState } from 'react'
import { fetchServerReport, type ServerReport } from '../api/serverReport'
import { failedState } from './useLiveReport'

export type ServerReportState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; report: ServerReport }

/** O painel do servidor dos últimos `days` dias; 403 = não é dev. */
export function useServerReport(days: number): { state: ServerReportState; reload: () => void } {
  const [state, setState] = useState<ServerReportState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetchServerReport(days)
      .then((report) => !cancelled && setState({ status: 'ready', report }))
      .catch((err: unknown) => {
        if (!cancelled) setState(failedState(err) as ServerReportState)
      })
    return () => {
      cancelled = true
    }
  }, [days, version])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { state, reload }
}
