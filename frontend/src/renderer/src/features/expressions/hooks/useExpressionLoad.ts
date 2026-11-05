import { useCallback, useEffect, useState } from 'react'
import { startLoad, type LoadStatus } from '../lib/loadStatus'

/**
 * Carrega a lista ao abrir a seção. `load` diz se deu certo (memorize com
 * useCallback: mudar a função carrega de novo).
 */
export function useExpressionLoad(load: () => Promise<boolean>): {
  status: LoadStatus
  retry: () => void
} {
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => startLoad(load, setStatus), [load, attempt])
  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])
  return { status, retry }
}
