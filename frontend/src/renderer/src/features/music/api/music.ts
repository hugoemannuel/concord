import { API_BASE_URL } from '../../../shared/lib/config'
import { request } from '../../../shared/api/client'

export interface MusicUser {
  id: string
  username: string
  display_name: string
  avatar_url?: string | null
}

export interface MusicItem {
  id: string
  video_id: string
  title: string
  artist: string
  thumbnail: string
  duration_ms: number
  requested_by: MusicUser
  has_video: boolean
  video_ready: boolean
}

export interface MusicState {
  call_id: string
  channel_id: string
  server_id: string
  server_time: number
  closed?: boolean
  now: { item: MusicItem; started_at: number } | null
  queue: MusicItem[]
  skip: { votes: number; needed: number; voters: string[] }
}

export interface MusicSearchResult {
  video_id: string
  title: string
  artist: string
  thumbnail: string
  duration_ms: number
}

export interface MusicSearchEvent {
  token: string
  channel_id: string
  query: string
  expires_at: number
  results: MusicSearchResult[]
}

export interface MusicReplyEvent {
  channel_id: string
  text: string
}

export interface MusicPresenceEvent {
  server_id: string
  channel_id: string
  active: boolean
}

export async function getMusicState(serverId: string): Promise<MusicState | null> {
  return (await request<MusicState | undefined>(`/servers/${serverId}/music/state`)) ?? null
}

export async function getMusicPresence(serverId: string): Promise<string[]> {
  const res = await request<{ channel_ids: string[] }>(`/servers/${serverId}/music/presence`)
  return res.channel_ids
}

export function pickSearchResult(serverId: string, token: string, index: number): Promise<void> {
  return request<void>(`/servers/${serverId}/music/pick`, {
    method: 'POST',
    body: JSON.stringify({ token, index })
  })
}

/** Põe na fila o primeiro resultado da busca "artista - título", na call em que estou. */
export function enqueueMusicQuery(serverId: string, query: string): Promise<void> {
  return request<void>(`/servers/${serverId}/music/enqueue`, {
    method: 'POST',
    body: JSON.stringify({ query })
  })
}

export function skipMusic(
  serverId: string
): Promise<{ kind: 'nothing' | 'done' | 'voted' | 'already'; votes: number; needed: number }> {
  return request(`/servers/${serverId}/music/skip`, { method: 'POST' })
}

export function removeQueueItem(serverId: string, itemId: string): Promise<void> {
  return request<void>(`/servers/${serverId}/music/queue/${itemId}`, { method: 'DELETE' })
}

export function swapQueueItems(serverId: string, a: string, b: string): Promise<void> {
  return request<void>(`/servers/${serverId}/music/queue/swap`, {
    method: 'POST',
    body: JSON.stringify({ a, b })
  })
}

export function setVideoWatching(serverId: string, watching: boolean): Promise<void> {
  return request<void>(`/servers/${serverId}/music/video-watch`, {
    method: 'POST',
    body: JSON.stringify({ watching })
  })
}

export function disableMaestro(serverId: string): Promise<void> {
  return request<void>(`/servers/${serverId}/music-bot`, { method: 'DELETE' })
}

export function musicVideoUrl(itemId: string, mediaToken: string): string {
  return `${API_BASE_URL}/music/video/${itemId}?token=${encodeURIComponent(mediaToken)}`
}
