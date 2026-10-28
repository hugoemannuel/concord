import { request } from '../../../shared/api/client'

export interface AuditChange {
  field: string
  before: unknown
  after: unknown
}

export interface AuditEntry {
  id: number
  action: string
  created_at: string
  actor_id: string | null
  actor_name: string | null
  target_type: string
  target_id: string
  target_name: string
  changes: AuditChange[]
  result: string
}

export interface AuditPage {
  entries: AuditEntry[]
  next_before: number | null
}

export function listAudit(serverId: string, actor: string, action: string, before?: number): Promise<AuditPage> {
  const query = new URLSearchParams()
  if (actor) query.set('actor_id', actor)
  if (action) query.set('action', action)
  if (before !== undefined) query.set('before', String(before))
  return request<AuditPage>(`/servers/${encodeURIComponent(serverId)}/audit-logs?${query}`)
}
