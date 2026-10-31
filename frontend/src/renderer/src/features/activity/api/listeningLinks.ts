import { request } from '../../../shared/api/client'
import type { DirectLinks } from '../lib/listeningLinks'

/** Links diretos da faixa em cada serviço (o servidor busca e guarda em cache). */
export async function fetchDirectLinks(title: string, artist?: string): Promise<DirectLinks> {
  const query = new URLSearchParams({ title: title.trim() })
  if (artist?.trim()) query.set('artist', artist.trim())
  const body = await request<{ links?: DirectLinks }>(`/music/links?${query.toString()}`)
  return body.links ?? {}
}
