import { API_BASE_URL } from '../../../shared/lib/config'
import { request } from '../../../shared/api/client'
import { uploadTo, type UploadMessages } from '../../../shared/api/upload'

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

const STICKER_UPLOAD_MESSAGES: UploadMessages = {
  http: (status, serverError) => serverError ?? `Upload failed: ${status}`,
  network: 'Falha de rede ao enviar figurinha'
}

export function uploadServerSticker(
  serverId: string,
  name: string,
  file: Blob,
  filename = 'sticker.png'
): Promise<ServerSticker> {
  return uploadTo<ServerSticker>(
    `/servers/${encodeURIComponent(serverId)}/stickers`,
    { fields: { name: name.trim() }, files: [{ field: 'file', blob: file, filename }] },
    { messages: STICKER_UPLOAD_MESSAGES }
  )
}
