import { createContext, useContext, useEffect } from 'react'
import type { ReportState } from './useLiveReport'

// O relatório das lives (GET /obs/lives) é um pedido só para as abas que o usam
// (Lives, Chamadas, Servidor, Distribuição, Eventos): o LiveReportProvider do
// painel guarda o resultado, e trocar de aba não repete o pedido.

export interface SharedLiveReport {
  state: ReportState
  reload: () => void
  /** Pede o relatório do período; o provider só busca quando alguma aba pede. */
  request: (days: number) => void
}

export const LiveReportContext = createContext<SharedLiveReport | null>(null)

/** O relatório dos últimos `days` dias, compartilhado entre as abas do painel. */
export function useSharedLiveReport(days: number): Omit<SharedLiveReport, 'request'> {
  const shared = useContext(LiveReportContext)
  if (!shared) throw new Error('useSharedLiveReport fora do LiveReportProvider')
  const { request } = shared
  useEffect(() => request(days), [request, days])
  return shared
}
