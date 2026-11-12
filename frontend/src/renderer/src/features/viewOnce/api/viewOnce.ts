import { request } from '../../../shared/api/client'

/** Abre a visualização única: devolve o token (curto) que libera o arquivo. */
export function openViewOnce(attachmentId: string): Promise<{ token: string; expires_at: string }> {
  return request<{ token: string; expires_at: string }>(
    `/attachments/${encodeURIComponent(attachmentId)}/open`,
    { method: 'POST' }
  )
}
