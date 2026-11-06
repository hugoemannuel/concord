import { API_BASE_URL } from '../../../shared/lib/config'
import { request } from '../../../shared/api/client'
import type { BasePack } from '../lib/baseEmojis'

export const MAX_EMOJI_BYTES = 256 * 1024
export const MAX_EMOJIS_PER_SERVER = 50
export const EMOJI_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif'

export interface CustomEmoji {
  id: string
  server_id: string
  uploader_id: string
  name: string
  content_type: string
  size_bytes: number
  created_at: string
}

/** Os emojis de um servidor de que a pessoa é membro. */
export interface ServerEmojis {
  server_id: string
  server_name: string
  server_icon_url?: string | null
  emojis: CustomEmoji[]
}

export function fetchMyEmojis(): Promise<ServerEmojis[]> {
  return request<ServerEmojis[]>('/emojis')
}

export function fetchBasePack(): Promise<BasePack> {
  return request<BasePack>('/emojis/base')
}

export function deleteServerEmoji(serverId: string, emojiId: string): Promise<void> {
  return request<void>(
    `/servers/${encodeURIComponent(serverId)}/emojis/${encodeURIComponent(emojiId)}`,
    { method: 'DELETE' }
  )
}

export function emojiFileUrl(emojiId: string, mediaToken: string): string {
  return `${API_BASE_URL}/emojis/${encodeURIComponent(emojiId)}/file?token=${encodeURIComponent(mediaToken)}`
}

export function uploadServerEmoji(serverId: string, name: string, file: Blob): Promise<CustomEmoji> {
  const form = new FormData()
  form.append('name', name)
  form.append('file', file, 'emoji')
  return request<CustomEmoji>(`/servers/${encodeURIComponent(serverId)}/emojis`, {
    method: 'POST',
    body: form,
    timeoutMs: 0
  })
}
