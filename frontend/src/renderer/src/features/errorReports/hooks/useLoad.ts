import { useCallback, useEffect, useRef, useState } from 'react'
import { attemptKey, failedLoad, stateForKey, type LoadState } from '../lib/errorPanelState'

/**
 * O resultado de `load` para o pedido `key` (null = não buscar). Trocou a
 * chave (período, filtro, grupo) e o pedido novo não voltou: `loading`.
 */
export function useLoad<T>(
  key: string | null,
  load: () => Promise<T>
): { state: LoadState<T>; reload: () => void } {
  const [entry, setEntry] = useState<{ key: string; state: LoadState<T> } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const latest = useRef(load)
  useEffect(() => {
    latest.current = load
  })
  const full = attemptKey(key, attempt)
  useEffect(() => {
    if (full === null) return
    let cancelled = false
    const done = (state: LoadState<T>): void => {
      if (!cancelled) setEntry({ key: full, state })
    }
    latest
      .current()
      .then((data) => done({ status: 'ready', data }))
      .catch((err: unknown) => done(failedLoad(err)))
    return () => {
      cancelled = true
    }
  }, [full])
  const reload = useCallback(() => setAttempt((a) => a + 1), [])
  return { state: stateForKey(entry, full), reload }
}
