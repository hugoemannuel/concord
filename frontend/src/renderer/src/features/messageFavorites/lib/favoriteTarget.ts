import type { MessageFavorite } from '../api/messageFavorites'

/** Para onde abrir a favorita: a rota da sala e a chave da sala (pulo até a mensagem). */
export interface FavoriteDestination {
  path: string
  room: string
}

/** A sala da favorita; null quando não há onde abrir (indisponível ou origem incompleta). */
export function favoriteDestination(fav: MessageFavorite): FavoriteDestination | null {
  const { message, origin } = fav
  if (fav.unavailable || !message || !origin) return null
  if (message.channel_id) {
    if (!origin.server_id) return null
    return {
      path: `/servers/${origin.server_id}/channels/${message.channel_id}`,
      room: `channel:${message.channel_id}`
    }
  }
  const conversationId = message.conversation_id
  if (!conversationId) return null
  const room = `conversation:${conversationId}`
  if (origin.conversation_type === 'group') return { path: `/dm/c/${conversationId}`, room }
  return origin.dm_user ? { path: `/dm/${origin.dm_user.id}`, room } : null
}

/** O rótulo da origem: canal (com o servidor), DM (a outra pessoa) ou grupo. */
export interface FavoriteOriginLabel {
  kind: 'channel' | 'dm' | 'group'
  title: string
  detail?: string
}

export function favoriteOrigin(fav: MessageFavorite): FavoriteOriginLabel {
  const origin = fav.origin ?? {}
  if (fav.message?.channel_id) {
    return { kind: 'channel', title: origin.channel_name ?? '', detail: origin.server_name }
  }
  if (origin.conversation_type === 'group') {
    return { kind: 'group', title: origin.conversation_name || 'Grupo' }
  }
  const user = origin.dm_user
  return { kind: 'dm', title: user?.display_name || user?.username || 'Mensagem direta' }
}
