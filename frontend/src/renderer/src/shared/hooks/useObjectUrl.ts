import { useEffect, useState } from 'react'

/** Cria a URL do arquivo e devolve quem a libera (o efeito do useObjectUrl, testável sem DOM). */
export function bindObjectUrl(file: Blob | null, set: (url: string | null) => void): (() => void) | undefined {
  if (!file) {
    set(null)
    return undefined
  }
  const url = URL.createObjectURL(file)
  set(url)
  return () => URL.revokeObjectURL(url)
}

/** URL local (blob:) para a prévia do arquivo; liberada ao trocar o arquivo ou desmontar. */
export function useObjectUrl(file: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => bindObjectUrl(file, setUrl), [file])
  return url
}
