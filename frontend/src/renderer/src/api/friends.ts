import { request } from './client'
import type { PublicUser } from '../store/authStore'
import type { NameStyle } from '../lib/nameStyle'

export interface PendingRequest {
  user_id: string
  username: string
  display_name: string
  avatar_url?: string | null
  name_style?: NameStyle
  direction: 'incoming' | 'outgoing'
  created_at: string
}

/** "accepted" quando a outra pessoa já tinha mandado pedido (vira amizade). */
export type SendRequestResult = 'sent' | 'accepted'

export function sendFriendRequest(
  username: string
): Promise<{ message: string; result: SendRequestResult }> {
  return request<{ message: string; result: SendRequestResult }>('/friends/request', {
    method: 'POST',
    body: JSON.stringify({ username })
  })
}

export function listFriends(): Promise<PublicUser[]> {
  return request<PublicUser[]>('/friends')
}

export function listPending(): Promise<PendingRequest[]> {
  return request<PendingRequest[]>('/friends/pending')
}

export function acceptFriendRequest(username: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/friends/${encodeURIComponent(username)}/accept`, {
    method: 'PUT'
  })
}

export function declineFriendRequest(username: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/friends/${encodeURIComponent(username)}/decline`, {
    method: 'PUT'
  })
}

export function cancelFriendRequest(username: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/friends/request/${encodeURIComponent(username)}`, {
    method: 'DELETE'
  })
}

export function removeFriend(username: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/friends/${encodeURIComponent(username)}`, {
    method: 'DELETE'
  })
}

export function listBlocked(): Promise<PublicUser[]> {
  return request<PublicUser[]>('/friends/blocked')
}

export function blockUser(userId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/users/${userId}/block`, { method: 'PUT' })
}

export function unblockUser(userId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/users/${userId}/block`, { method: 'DELETE' })
}

/** Relação com outra pessoa; quem foi bloqueado vê "none". */
export type RelationshipType = 'none' | 'friend' | 'incoming' | 'outgoing' | 'blocked'

export interface MutualServer {
  id: string
  name: string
  icon_url?: string | null
}

export interface Relationship {
  type: RelationshipType
  mutual_friends: PublicUser[]
  mutual_servers: MutualServer[]
}

export function getRelationship(userId: string): Promise<Relationship> {
  return request<Relationship>(`/users/${userId}/relationship`)
}
