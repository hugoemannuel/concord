import { createContext, useContext, useEffect } from 'react'
import { stateForKey } from '../lib/stateForKey'
import type { ReportState } from './useLiveReport'

// O relatório das lives (GET /obs/lives) é um pedido só para as abas que o usam
// (Lives, Chamadas, Servidor, Distribuição, Eventos): o LiveReportProvider do
// painel guarda o resultado, e trocar de aba não repete o pedido.

export interface SharedLiveReport {
  /** O período que o provider está buscando (null = nenhuma aba pediu ainda). */
  days: number | null
  state: ReportState
  reload: () => void
  /** Pede o relatório do período; o provider só busca quando alguma aba pede. */
  request: (days: number) => void
}

export const LiveReportContext = createContext<SharedLiveReport | null>(null)

/** O relatório dos últimos `days` dias, compartilhado entre as abas do painel. */
export function useSharedLiveReport(days: number): { state: ReportState; reload: () => void } {
  const shared = useContext(LiveReportContext)
  if (!shared) throw new Error('useSharedLiveReport fora do LiveReportProvider')
  const { request } = shared
  useEffect(() => request(days), [request, days])
  const state = stateForKey({ key: shared.days, state: shared.state }, days, LOADING)
  return { state, reload: shared.reload }
}

const LOADING: ReportState = { status: 'loading' }
