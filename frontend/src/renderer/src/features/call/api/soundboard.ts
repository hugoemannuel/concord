import { API_BASE_URL } from '../../../shared/lib/config'
import { request } from '../../../shared/api/client'
import { uploadTo, type UploadMessages } from '../../../shared/api/upload'

export const MAX_SOUNDBOARD_BYTES = 5 * 1024 * 1024 // 5 MB
export const MIN_SOUNDBOARD_DURATION_MS = 100
export const MAX_SOUNDBOARD_DURATION_MS = 15_000 // 15s
export const MAX_SOUNDBOARD_NAME_LEN = 32

export interface SoundboardItem {
  id: string
  server_id: string
  uploader_id: string
  uploader_name: string
  name: string
  emoji?: string | null
  content_type: string
  size_bytes: number
  duration_ms: number
  created_at: string
}

export interface UploadSoundboardInput {
  name: string
  emoji?: string
  duration_ms: number
  filename?: string
}

/** Os sons de um servidor de que a pessoa é membro (servidor sem som não vem). */
export interface ServerSounds {
  server_id: string
  server_name: string
  server_icon_url?: string | null
  sounds: SoundboardItem[]
}

/** Os sons de todos os servidores da pessoa, numa consulta só (como as figurinhas). */
export function listMySounds(): Promise<ServerSounds[]> {
  return request<ServerSounds[]>('/soundboard')
}

export function listServerSounds(serverId: string): Promise<SoundboardItem[]> {
  return request<SoundboardItem[]>(`/servers/${serverId}/soundboard`)
}

export function deleteServerSound(serverId: string, soundId: string): Promise<void> {
  return request<void>(`/servers/${serverId}/soundboard/${soundId}`, {
    method: 'DELETE'
  })
}

export function soundFileUrl(soundId: string, mediaToken: string): string {
  return `${API_BASE_URL}/soundboard/${encodeURIComponent(soundId)}/file?token=${encodeURIComponent(mediaToken)}`
}

const SOUND_UPLOAD_MESSAGES: UploadMessages = {
  http: (_status, serverError) => serverError ?? 'Falha ao enviar áudio',
  network: 'Erro de rede ao enviar áudio',
  aborted: 'Envio cancelado'
}

export function uploadServerSound(
  serverId: string,
  file: Blob,
  { name, emoji, duration_ms, filename = 'sound.mp3' }: UploadSoundboardInput
): Promise<SoundboardItem> {
  return uploadTo<SoundboardItem>(
    `/servers/${encodeURIComponent(serverId)}/soundboard`,
    {
      fields: { name: name.trim(), emoji: emoji?.trim() || undefined, duration_ms: Math.round(duration_ms) },
      files: [{ field: 'file', blob: file, filename }]
    },
    { messages: SOUND_UPLOAD_MESSAGES }
  )
}
