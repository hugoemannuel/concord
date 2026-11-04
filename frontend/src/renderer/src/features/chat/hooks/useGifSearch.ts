import { useEffect, useState } from 'react'
import { fetchTrendingGifs, searchGifs, type GifItem } from '../api/gifs'

interface GifResult {
  query: string
  gifs: GifItem[]
  /** Sem chave no servidor ou a KLIPY falhou: a aba mostra "GIFs indisponíveis". */
  unavailable: boolean
}

/**
 * GIFs do seletor de mídia: em alta sem busca, ou o resultado da busca (com
 * espera de 250 ms entre teclas). Só busca com a aba de GIFs aberta; está
 * carregando enquanto o resultado não é o da busca atual.
 */
export function useGifSearch(
  enabled: boolean,
  search: string
): { gifs: GifItem[]; loading: boolean; unavailable: boolean } {
  const [result, setResult] = useState<GifResult | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const timer = setTimeout(() => {
      const trimmed = search.trim()
      const req = trimmed ? searchGifs(trimmed) : fetchTrendingGifs()
      req
        .then((gifs) => ({ gifs, unavailable: false }))
        .catch(() => ({ gifs: [] as GifItem[], unavailable: true }))
        .then((done) => {
          if (!cancelled) setResult({ query: search, ...done })
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled, search])

  return {
    gifs: result?.gifs ?? [],
    loading: enabled && result?.query !== search,
    unavailable: result?.unavailable ?? false
  }
}
