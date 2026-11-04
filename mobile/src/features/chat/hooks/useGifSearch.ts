import { useEffect, useState } from 'react'
import { fetchTrendingGifs, searchGifs, type GifItem } from '../api/gifs'

interface GifResult {
  query: string
  gifs: GifItem[]
}

/**
 * GIFs do seletor: em alta sem busca, ou o resultado da busca (espera de 250 ms entre
 * teclas). Só busca com a aba aberta; carrega enquanto o resultado não é o da busca atual.
 */
export function useGifSearch(enabled: boolean, search: string): { gifs: GifItem[]; loading: boolean } {
  const [result, setResult] = useState<GifResult | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const timer = setTimeout(() => {
      const trimmed = search.trim()
      const req = trimmed ? searchGifs(trimmed) : fetchTrendingGifs()
      req
        .catch(() => [])
        .then((gifs) => {
          if (!cancelled) setResult({ query: search, gifs })
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled, search])

  return { gifs: result?.gifs ?? [], loading: enabled && result?.query !== search }
}
