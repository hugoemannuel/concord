import { request } from '../../../shared/api/client'

// Alertas do servidor dos devs (backend: internal/alert, GET /obs/alerts; só devs).

export type AlertSeverity = 'aviso' | 'critico'

export interface AlertRow {
  id: number
  rule_id: string
  /** Nome da regra ("CPU da máquina"). */
  title: string
  channel: string
  severity: AlertSeverity
  started_at: string
  /** null = disparado agora. */
  ended_at: string | null
  text: string
}

export interface AlertReport {
  /** ALERTS_SERVER_ID ligado no servidor. */
  enabled: boolean
  active: AlertRow[]
  history: AlertRow[]
  /** Quando saiu o último resumo diário em #resumo-diario (null = nenhum). */
  last_summary_at?: string | null
}

export function fetchAlertReport(days: number): Promise<AlertReport> {
  return request<AlertReport>(`/obs/alerts?days=${days}`)
}
