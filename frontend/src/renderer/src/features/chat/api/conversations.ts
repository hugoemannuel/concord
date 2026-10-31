import { request } from '../../../shared/api/client'
import { uploadImage } from '../../profile/api/users'
import type { NameStyle } from '../../profile/lib/nameStyle'

export type ConversationType = 'dm' | 'group'

/** Máximo de pessoas numa DM em grupo (contando quem criou). */
export const MAX_GROUP_MEMBERS = 10

export interface Conversation {
  id: string
  type: ConversationType
  /** Nome do grupo ('' = mostra os nomes dos participantes). */
  name: string
  icon_url?: string | null
  owner_id?: string | null
  /** Só na DM 1:1. */
  user_a_id?: string
  user_b_id?: string
  created_at: string
  updated_at: string
}

export interface ConversationOtherUser {
  id: string
  username: string
  display_name: string
  avatar_url?: string | null
  name_style?: NameStyle
  /** Faixa efetiva (o banner ou a imagem própria; ausente = sem faixa). */
  nameplate_url?: string | null
  /** Moldura do avatar (ausente = sem moldura). */
  avatar_decoration_url?: string | null
}

export interface ConversationLastMessage {
  id: string
  author_id: string
  content: string
  created_at: string
}

export interface ConversationSummary extends Conversation {
  /** Só na DM 1:1. */
  other_user?: ConversationOtherUser
  /** Todos os participantes, inclusive você. */
  members: ConversationOtherUser[]
  last_message?: ConversationLastMessage
  unread_count: number
}

export interface ConversationDetail extends Conversation {
  members: ConversationOtherUser[]
}

// include_groups=1: este app sabe mostrar DM em grupo. Sem isso, o servidor
// esconde os grupos de apps desktop antigos (< 0.6.15), que quebravam com eles.
export function listConversations(): Promise<ConversationSummary[]> {
  return request<ConversationSummary[]>('/conversations?include_groups=1')
}

export function getOrCreateConversationWith(userId: string): Promise<Conversation> {
  return request<Conversation>(`/conversations/with/${userId}`)
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/conversations/${id}`)
}

/** Com um amigo só, o servidor devolve a DM 1:1. */
export function createGroup(userIds: string[]): Promise<Conversation> {
  return request<Conversation>('/conversations/group', {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds })
  })
}

export function renameGroup(id: string, name: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/conversations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name })
  })
}

export function addGroupMembers(id: string, userIds: string[]): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/conversations/${id}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds })
  })
}

export function removeGroupMember(id: string, userId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/conversations/${id}/members/${userId}`, {
    method: 'DELETE'
  })
}

export function leaveGroup(id: string): Promise<{ message: string }> {
  return removeGroupMember(id, 'me')
}

export function removeGroupIcon(id: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/conversations/${id}/icon`, { method: 'DELETE' })
}

/** Fecha a DM 1:1 (volta quando chegar mensagem nova). */
export function hideConversation(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/conversations/${id}/hide`, { method: 'POST' })
}

export function markConversationRead(id: string, messageId?: string): Promise<void> {
  return request<void>(`/conversations/${id}/read`, {
    method: 'POST',
    body: JSON.stringify(messageId ? { message_id: messageId } : {})
  })
}

export function uploadGroupIcon(
  id: string,
  file: Blob,
  staticFrame?: Blob
): Promise<ConversationDetail> {
  return uploadImage<ConversationDetail>(`/conversations/${id}/icon`, 'icon', file, staticFrame)
}
