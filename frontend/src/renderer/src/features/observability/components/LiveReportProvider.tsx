import { useMemo, useState } from 'react'
import { useLiveReport } from '../hooks/useLiveReport'
import { LiveReportContext } from '../hooks/useSharedLiveReport'

/** Guarda o relatório das lives para as abas do painel (ver useSharedLiveReport). */
export function LiveReportProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [days, setDays] = useState<number | null>(null)
  const { state, reload } = useLiveReport(days)
  const value = useMemo(() => ({ state, reload, request: setDays }), [state, reload])
  return <LiveReportContext.Provider value={value}>{children}</LiveReportContext.Provider>
}
