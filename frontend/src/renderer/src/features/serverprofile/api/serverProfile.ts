import { rawRequest, request } from '../../../shared/api/client'
import { uploadImage } from '../../profile/api/users'

// Cliente REST da customização do servidor (backend/internal/serverprofile).

/** Um fundo: degradê da paleta (lib/serverArt) ou imagem enviada (a imagem ganha). */
export interface ServerArt {
  preset: string
  image: string
}

export interface ServerTrait {
  emoji: string
  text: string
}

/** Jogo em destaque; app_id e icon_hash só nos da Steam. */
export interface ServerGame {
  name: string
  app_id?: number
  icon_hash?: string
}

export interface ServerTheme {
  starter: string
  image: string
  dim: number
}

export interface ServerTag {
  server_id: string
  name: string
  badge: string
  color: string
}

export interface ServerProfile {
  banner: ServerArt
  traits: ServerTrait[]
  description: string
  games: ServerGame[]
  private: boolean
  strip: ServerArt
  theme: ServerTheme
  tag: ServerTag | null
}

/** O cartão do servidor. locked: perfil privado para quem está fora (só isso volta). */
export interface ServerCard {
  server_id?: string
  locked: boolean
  name?: string
  icon_url?: string | null
  created_at?: string
  member_count: number
  online_count: number
  is_member: boolean
  profile?: ServerProfile
}

/** Edição da tag; name vazio tira a tag do servidor. */
export interface TagEdit {
  name: string
  badge: string
  color: string
}

/** Só o que veio muda. */
export interface ProfilePatch {
  banner?: ServerArt
  traits?: ServerTrait[]
  description?: string
  games?: ServerGame[]
  private?: boolean
  strip?: ServerArt
  theme?: ServerTheme
  tag?: TagEdit
}

export interface TagOption extends ServerTag {
  server_name: string
  server_icon_url?: string | null
}

export interface MyServerTags {
  current: ServerTag | null
  options: TagOption[]
}

export function getServerCard(serverId: string, invite?: string): Promise<ServerCard> {
  const query = invite ? `?invite=${encodeURIComponent(invite)}` : ''
  return request<ServerCard>(`/servers/${serverId}/card${query}`)
}

/** Cartão da prévia do link: público (abre antes do login). */
export function getInviteCard(code: string, signedIn = false): Promise<ServerCard> {
  const path = `/invites/${encodeURIComponent(code)}/card`
  return signedIn ? request<ServerCard>(path) : rawRequest<ServerCard>(path)
}

export function updateServerProfile(serverId: string, patch: ProfilePatch): Promise<ServerCard> {
  return request<ServerCard>(`/servers/${serverId}/profile`, {
    method: 'PUT',
    body: JSON.stringify(patch)
  })
}

export async function uploadServerProfileImage(serverId: string, file: Blob): Promise<string> {
  const { url } = await uploadImage<{ url: string }>(`/servers/${serverId}/profile/image`, 'imagem', file)
  return url
}

export async function getMemberGames(serverId: string): Promise<ServerGame[]> {
  const { games } = await request<{ games: ServerGame[] }>(`/servers/${serverId}/profile/member-games`)
  return games
}

export async function lookupServerTags(userIds: string[]): Promise<Record<string, ServerTag>> {
  const { tags } = await request<{ tags: Record<string, ServerTag> }>('/server-tags/lookup', {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds })
  })
  return tags
}

export function getMyServerTags(): Promise<MyServerTags> {
  return request<MyServerTags>('/users/me/server-tag')
}

export function applyServerTag(serverId: string): Promise<{ tag: ServerTag }> {
  return request<{ tag: ServerTag }>('/users/me/server-tag', {
    method: 'PUT',
    body: JSON.stringify({ server_id: serverId })
  })
}

export function clearServerTag(): Promise<void> {
  return request<void>('/users/me/server-tag', { method: 'DELETE' })
}
