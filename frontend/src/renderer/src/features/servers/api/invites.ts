import { rawRequest, request } from '../../../shared/api/client'

/**
 * Prévia do link de convite. Pública (abre antes do login); só quem manda o
 * token recebe o id do servidor e se já é membro.
 */
export interface InvitePreview {
  server_id?: string
  is_member?: boolean
  name: string
  icon_url?: string | null
  member_count: number
  online_count: number
}

export function getInvitePreview(code: string, signedIn = false): Promise<InvitePreview> {
  const path = `/invites/${encodeURIComponent(code)}/preview`
  return signedIn ? request<InvitePreview>(path) : rawRequest<InvitePreview>(path)
}
