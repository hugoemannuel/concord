import { useEffect, useState } from 'react'

function readCollapsed(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] }
}

/** Preferência local, isolada por conta e servidor. */
export function useCollapsedCategories(userId: string, serverId: string): [string[], (ids: string[]) => void] {
  const key = `salinha-categorias-recolhidas-v1:${userId}:${serverId}`
  const [saved, setSaved] = useState(() => ({ key, ids: readCollapsed(key) }))
  const ids = saved.key === key ? saved.ids : readCollapsed(key)
  useEffect(() => { setSaved({ key, ids: readCollapsed(key) }) }, [key])
  const save = (next: string[]): void => {
    setSaved({ key, ids: next })
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* preferência só na sessão */ }
  }
  return [ids, save]
}
