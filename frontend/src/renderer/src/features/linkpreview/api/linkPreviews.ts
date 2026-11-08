import { request } from '../../../shared/api/client'
import { API_BASE_URL } from '../../../shared/lib/config'
import { roomPath, type Message } from '../../chat/api/messages'

/** Cartão de prévia de um link (internal/linkpreview no backend). */
export interface LinkPreview {
  url: string
  site_name?: string
  title?: string
  description?: string
  /** Imagem baixada pelo servidor (o site do link não vê quem lê). */
  image_id?: string
  /** theme-color do site (#rgb/#rrggbb), para a faixa do cartão. */
  color?: string
  /** Vídeo do YouTube: toca dentro do chat. */
  youtube_id?: string
}

/** A prévia do link, ou null quando a página não tem cartão (204). */
export async function getLinkPreview(url: string): Promise<LinkPreview | null> {
  const preview = await request<LinkPreview | undefined>(`/link-previews?url=${encodeURIComponent(url)}`)
  return preview ?? null
}

/** Endereço da imagem do cartão (rota pública: um <img> não manda o token). */
export function linkPreviewImageUrl(imageId: string): string {
  return `${API_BASE_URL}/link-previews/image/${encodeURIComponent(imageId)}`
}

/** Tira as prévias de link de uma mensagem sua (canal ou DM, pela sala). */
export function suppressEmbeds(room: string, messageId: string): Promise<Message> {
  return request<Message>(`${roomPath(room)}/messages/${messageId}/suppress-embeds`, { method: 'POST' })
}
