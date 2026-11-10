import { request } from '../../../shared/api/client'
import type { Message, MessageAuthor } from '../../chat/api/messages'

const FAVORITES = '/users/me/message-favorites'

/** De onde a mensagem favorita é: canal de servidor ou DM (1:1 ou grupo). */
export interface FavoriteOrigin {
  server_id?: string
  server_name?: string
  channel_name?: string
  conversation_type?: 'dm' | 'group'
  conversation_name?: string
  /** A outra pessoa da DM 1:1. */
  dm_user?: MessageAuthor
}

/**
 * Um item da lista. `unavailable`: a pessoa não lê mais a sala (saiu do
 * servidor, perdeu o cargo, saiu do grupo); vem só o id, para poder tirar.
 */
export interface MessageFavorite {
  message_id: string
  favorited_at: string
  unavailable?: boolean
  message?: Message
  origin?: FavoriteOrigin
}

/** As favoritas, da mais recente à mais antiga. */
export function listMessageFavorites(): Promise<MessageFavorite[]> {
  return request<MessageFavorite[]>(FAVORITES)
}

/** Só os ids (o menu da mensagem diz se ela é favorita). */
export function listMessageFavoriteIds(): Promise<string[]> {
  return request<string[]>(`${FAVORITES}/ids`)
}

export function addMessageFavorite(messageId: string): Promise<MessageFavorite> {
  return request<MessageFavorite>(`${FAVORITES}/${encodeURIComponent(messageId)}`, {
    method: 'PUT'
  })
}

export function removeMessageFavorite(messageId: string): Promise<void> {
  return request<void>(`${FAVORITES}/${encodeURIComponent(messageId)}`, { method: 'DELETE' })
}
