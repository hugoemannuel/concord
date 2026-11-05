import { API_BASE_URL } from '../../../shared/lib/config'
import { useAuthStore } from '../../auth/store/authStore'
import { ApiError, refreshTokens, request } from '../../../shared/api/client'

export const MAX_STICKER_BYTES = 1024 * 1024 // 1 MB
export const MAX_STICKER_NAME_LEN = 32

export interface ServerSticker {
  id: string
  server_id: string
  uploader_id: string
  uploader_name?: string
  name: string
  content_type: string
  size_bytes: number
  created_at: string
}

/** As figurinhas de um servidor de que a pessoa é membro. */
export interface ServerStickers {
  server_id: string
  server_name: string
  server_icon_url?: string | null
  stickers: ServerSticker[]
}

export function fetchMyStickers(): Promise<ServerStickers[]> {
  return request<ServerStickers[]>('/stickers')
}

export function deleteServerSticker(serverId: string, stickerId: string): Promise<void> {
  return request<void>(`/servers/${encodeURIComponent(serverId)}/stickers/${encodeURIComponent(stickerId)}`, {
    method: 'DELETE'
  })
}

export function stickerFileUrl(stickerId: string, mediaToken?: string | null): string {
  const query = mediaToken ? `?token=${encodeURIComponent(mediaToken)}` : ''
  return `${API_BASE_URL}/stickers/${encodeURIComponent(stickerId)}/file${query}`
}

export async function uploadServerSticker(
  serverId: string,
  name: string,
  file: Blob,
  filename?: string
): Promise<ServerSticker> {
  const token = useAuthStore.getState().accessToken
  try {
    return await sendStickerUpload(serverId, name, file, filename, token)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && token && (await refreshTokens())) {
      return sendStickerUpload(serverId, name, file, filename, useAuthStore.getState().accessToken)
    }
    throw err
  }
}

function sendStickerUpload(
  serverId: string,
  name: string,
  file: Blob,
  filename: string | undefined,
  token: string | null
): Promise<ServerSticker> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('name', name.trim())
    form.append('file', file, filename ?? 'sticker.png')

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}/servers/${encodeURIComponent(serverId)}/stickers`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.onload = () => {
      let body: unknown = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // ignore
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as ServerSticker)
        return
      }
      const message =
        typeof body === 'object' && body !== null && 'error' in body
          ? String((body as { error: unknown }).error)
          : `Upload failed: ${xhr.status}`
      reject(new ApiError(xhr.status, message))
    }

    xhr.onerror = () => reject(new ApiError(0, 'Falha de rede ao enviar figurinha'))
    xhr.send(form)
  })
}
