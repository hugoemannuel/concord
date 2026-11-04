import { request } from '../../../shared/api/client'
import type { GifItem } from './gifs'

const FAVORITES = '/users/me/gif-favorites'

export function listFavoriteGifs(): Promise<GifItem[]> {
  return request<GifItem[]>(FAVORITES)
}

/** Favorita e devolve a lista nova (o mais recente primeiro). */
export function addFavoriteGif(gif: GifItem): Promise<GifItem[]> {
  return request<GifItem[]>(`${FAVORITES}/${encodeURIComponent(gif.id)}`, {
    method: 'PUT',
    body: JSON.stringify(gif)
  })
}

/** Tira dos favoritos e devolve a lista nova. */
export function removeFavoriteGif(gifId: string): Promise<GifItem[]> {
  return request<GifItem[]>(`${FAVORITES}/${encodeURIComponent(gifId)}`, {
    method: 'DELETE'
  })
}
