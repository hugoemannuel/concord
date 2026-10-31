import type { GiphyItem } from '../api/giphy'

/** Limite de favoritos por pessoa (o mesmo do backend). */
export const MAX_GIF_FAVORITES = 200

/**
 * O id do GIPHY dentro da URL de mídia
 * (`https://media3.giphy.com/media/<id>/giphy.gif`, com ou sem o prefixo
 * `v1.…`). Vazio se a URL não tiver esse formato.
 */
export function gifIdFromUrl(url: string): string {
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
export function gifFromMessage(gifUrl: string, meta?: GifMessageMeta | null): GiphyItem | null {
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
