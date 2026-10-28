import { useEffect, useState } from 'react'
import { listAudit, type AuditPage } from '../api/audit'

export function useAuditLog(serverId: string, actor: string, action: string) {
  const [page, setPage] = useState<AuditPage | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [before, setBefore] = useState<number | undefined>()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    listAudit(serverId, actor, action, before).then((next) => {
      if (cancelled) return
      setPage((current) => before === undefined ? next : {
        entries: [...(current?.entries ?? []), ...next.entries],
        next_before: next.next_before
      })
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setPage(null)
      setError(true)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [serverId, actor, action, before, attempt])

  return {
    page, error, loading,
    retry: () => setAttempt((value) => value + 1),
    more: () => { if (page?.next_before != null) setBefore(page.next_before) }
  }
}
