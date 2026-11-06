import { API_BASE_URL } from '../../../shared/lib/config'
import { useAuthStore } from '../../auth/store/authStore'
import { ApiError, refreshTokens, request } from '../../../shared/api/client'

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

export async function uploadServerSound(
  serverId: string,
  file: Blob,
  input: UploadSoundboardInput
): Promise<SoundboardItem> {
  const token = useAuthStore.getState().accessToken
  try {
    return await sendSoundUpload(serverId, file, input, token)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && token && (await refreshTokens())) {
      return sendSoundUpload(serverId, file, input, useAuthStore.getState().accessToken)
    }
    throw err
  }
}

function sendSoundUpload(
  serverId: string,
  file: Blob,
  input: UploadSoundboardInput,
  token: string | null
): Promise<SoundboardItem> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('name', input.name.trim())
    if (input.emoji?.trim()) {
      form.append('emoji', input.emoji.trim())
    }
    form.append('duration_ms', String(Math.round(input.duration_ms)))
    form.append('file', file, input.filename ?? 'sound.mp3')

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}/servers/${encodeURIComponent(serverId)}/soundboard`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.onload = () => {
      let body: unknown = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // corpo vazio ou não-JSON
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as SoundboardItem)
      } else {
        reject(new ApiError(xhr.status, (body as { error?: string }).error ?? 'Falha ao enviar áudio'))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Erro de rede ao enviar áudio'))
    xhr.onabort = () => reject(new ApiError(0, 'Envio cancelado'))
    xhr.send(form)
  })
}
