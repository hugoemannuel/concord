import { useEffect, useState } from 'react'
import { fetchTextHead } from '../lib/textFile'

interface TextFileState {
  /** Texto já baixado (null enquanto carrega ou se falhou). */
  text: string | null
  failed: boolean
}

const LOADING: TextFileState = { text: null, failed: false }

/** Começo (maxBytes) de um anexo de texto, pedido só quando active vira true. */
export function useTextFile(attachmentId: string, maxBytes: number, active: boolean): TextFileState {
  const [state, setState] = useState<{ key: string; value: TextFileState } | null>(null)
  const key = `${attachmentId}:${maxBytes}`

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const settle = (value: TextFileState): void => {
      if (!cancelled) setState({ key, value })
    }
    fetchTextHead(attachmentId, maxBytes).then(
      (text) => settle({ text, failed: false }),
      () => settle({ text: null, failed: true })
    )
    return () => {
      cancelled = true
    }
  }, [attachmentId, maxBytes, active, key])

  return state?.key === key ? state.value : LOADING
}
