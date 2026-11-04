import type { GifItem } from '../api/gifs'
import { klipyIdFromUrl, providerOfUrl } from './klipy'

/** Limite de favoritos por pessoa (o mesmo do backend). */
export const MAX_GIF_FAVORITES = 200

/**
 * O id do GIF dentro da URL de mídia: o do GIPHY
 * (`https://media3.giphy.com/media/<id>/giphy.gif`, com ou sem o prefixo
 * `v1.…`) ou o hash da KLIPY (`https://static.klipy.com/ii/<hash>/…`).
 * Vazio se a URL não tiver nenhum desses formatos.
 */
export function gifIdFromUrl(url: string): string {
  if (providerOfUrl(url) === 'klipy') return klipyIdFromUrl(url)
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    return parts.length >= 3 && parts[0] === 'media' ? parts[parts.length - 2] : ''
  } catch {
    return ''
  }
}

interface GifMessageMeta {
  width?: number
  height?: number
  preview_url?: string
}

/** O GIF de uma mensagem como item do seletor; null se o id não der para tirar da URL. */
export function gifFromMessage(gifUrl: string, meta?: GifMessageMeta | null): GifItem | null {
  const id = gifIdFromUrl(gifUrl)
  if (!id) return null
  return {
    id,
    title: '',
    url: gifUrl,
    preview_url: meta?.preview_url ?? '',
    width: meta?.width ?? 0,
    height: meta?.height ?? 0
  }
}
