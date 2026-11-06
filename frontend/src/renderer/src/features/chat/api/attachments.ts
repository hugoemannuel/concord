import { request } from '../../../shared/api/client'
import { uploadTo, type UploadOptions } from '../../../shared/api/upload'
import { roomPath, type Attachment } from './messages'

export type { UploadOptions }

export interface UploadMeta {
  filename: string
  width?: number
  height?: number
  duration_ms?: number
}

/**
 * Sobe um arquivo para a sala (fica "pendente" até a mensagem ser criada com o
 * id dele). Progresso, cancelamento e renovação do token: ver uploadTo.
 */
export function uploadAttachment(
  room: string,
  file: Blob,
  meta: UploadMeta,
  opts: UploadOptions = {}
): Promise<Attachment> {
  return uploadMedia<Attachment>(`${roomPath(room)}/attachments`, file, meta, opts)
}

/** Arquivo com as medidas (largura, altura, duração) para uma rota de mídia. */
export function uploadMedia<T>(path: string, file: Blob, meta: UploadMeta, opts: UploadOptions = {}): Promise<T> {
  const { filename, width, height, duration_ms } = meta
  return uploadTo<T>(
    path,
    { fields: { width, height, duration_ms }, files: [{ field: 'file', blob: file, filename }] },
    opts
  )
}

/** Token curto (1 h) que vai na URL de <img>/<video>/<audio>. */
export function fetchMediaToken(): Promise<{ token: string; expires_at: string }> {
  return request<{ token: string; expires_at: string }>('/media/token')
}
