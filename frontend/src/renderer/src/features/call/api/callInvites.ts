import { request } from '../../../shared/api/client'

export type InviteResultStatus =
  | 'sent'
  | 'already_invited'
  | 'already_in_call'
  | 'not_friend'
  | 'blocked'
  | 'busy'
  | 'no_access'
  | 'dms_closed'
  | 'failed'

export interface InviteResult {
  user_id: string
  status: InviteResultStatus
}

/** Convida várias pessoas (amigos ou membros do servidor) de uma vez; o servidor valida cada um e posta o cartão na DM. */
export async function sendCallInvites(callId: string, userIds: string[]): Promise<InviteResult[]> {
  const res = await request<{ results: InviteResult[] }>(`/calls/${callId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds })
  })
  return res.results
}

/**
 * O cartão ainda vale para mim? Convidado: tem convite não usado e não está na
 * call. Convidador: a call existe. (Mensagem antiga na DM = não.)
 */
export async function fetchInviteValid(
  callId: string,
  role: 'inviter' | 'invitee'
): Promise<boolean> {
  const query = role === 'inviter' ? '?as=inviter' : ''
  const res = await request<{ valid: boolean }>(`/calls/${callId}/invite${query}`)
  return res.valid
}

/** "Abrir" o convite: o servidor dá o passe de entrada a quem foi convidado. */
export function openCallInvite(callId: string): Promise<{ admitted: boolean }> {
  return request(`/calls/${callId}/invites/open`, { method: 'POST' })
}
