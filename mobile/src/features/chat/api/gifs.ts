import { request } from '../../../shared/api/client'

export interface GifItem {
  id: string
  title: string
  url: string
  preview_url: string
  width: number
  height: number
}

export function fetchTrendingGifs(limit = 25, offset = 0): Promise<GifItem[]> {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset)
  })
  return request<GifItem[]>(`/gifs/trending?${query.toString()}`)
}

export function searchGifs(queryText: string, limit = 25, offset = 0): Promise<GifItem[]> {
  const query = new URLSearchParams({
    q: queryText,
    limit: String(limit),
    offset: String(offset)
  })
  return request<GifItem[]>(`/gifs/search?${query.toString()}`)
}
