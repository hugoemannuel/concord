import { request } from '../../../shared/api/client'
import type { DisappearingSeconds } from '../lib/disappearing'

/** Liga (prazo em segundos) ou desliga (null) as mensagens temporárias da conversa. */
export function setDisappearing(
  conversationId: string,
  seconds: DisappearingSeconds | null
): Promise<void> {
  return request<void>(`/conversations/${encodeURIComponent(conversationId)}/disappearing`, {
    method: 'PUT',
    body: JSON.stringify({ seconds })
  })
}
