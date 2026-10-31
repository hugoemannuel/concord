import type { AuditEntry } from '../api/auditLog'

/** Filtros da tela: quem fez e o tipo de ação (vazio = todos). */
export interface AuditFilter {
  actorId?: string
  action?: string
}

/** Junta a página nova no fim, sem repetir (a mesma linha pode vir duas vezes se a busca for refeita). */
export function mergeEntries(current: AuditEntry[], page: AuditEntry[]): AuditEntry[] {
  const seen = new Set(current.map((e) => e.id))
  return [...current, ...page.filter((e) => !seen.has(e.id))]
}

/** A query de GET /servers/:id/audit-log só com o que filtra. */
export function auditQuery(filter: AuditFilter, before: number | null): string {
  const params = new URLSearchParams()
  if (filter.actorId) params.set('actor_id', filter.actorId)
  if (filter.action) params.set('action', filter.action)
  if (before) params.set('before', String(before))
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Estado da lista: as linhas já carregadas e o cursor da próxima página. */
export interface AuditListState {
  entries: AuditEntry[]
  next: number | null
  loading: boolean
  failed: boolean
}

export type AuditListEvent =
  | { type: 'start'; reset: boolean }
  | { type: 'page'; entries: AuditEntry[]; next: number | null }
  | { type: 'fail' }

export const INITIAL_AUDIT_LIST: AuditListState = { entries: [], next: null, loading: true, failed: false }

/** Começar (do zero ao trocar filtro), receber página ou falhar. */
export function auditListReducer(state: AuditListState, event: AuditListEvent): AuditListState {
  switch (event.type) {
    case 'start':
      return event.reset ? INITIAL_AUDIT_LIST : { ...state, loading: true, failed: false }
    case 'page':
      return { entries: mergeEntries(state.entries, event.entries), next: event.next, loading: false, failed: false }
    case 'fail':
      return { ...state, loading: false, failed: true }
  }
}
