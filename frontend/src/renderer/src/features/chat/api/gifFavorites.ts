import { request } from '../../../shared/api/client'
import type { GiphyItem } from './giphy'

const FAVORITES = '/users/me/gif-favorites'

export function listFavoriteGifs(): Promise<GiphyItem[]> {
  return request<GiphyItem[]>(FAVORITES)
}

/** Favorita e devolve a lista nova (o mais recente primeiro). */
export function addFavoriteGif(gif: GiphyItem): Promise<GiphyItem[]> {
  return request<GiphyItem[]>(`${FAVORITES}/${encodeURIComponent(gif.id)}`, {
    method: 'PUT',
    body: JSON.stringify(gif)
  })
}

/** Tira dos favoritos e devolve a lista nova. */
export function removeFavoriteGif(gifId: string): Promise<GiphyItem[]> {
  return request<GiphyItem[]>(`${FAVORITES}/${encodeURIComponent(gifId)}`, {
    method: 'DELETE'
  })
}
