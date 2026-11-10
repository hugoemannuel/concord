import { request } from '../../../shared/api/client'
import type { Message } from './messages'

/** Destino do encaminhamento: um canal ou uma conversa (DM ou grupo). */
export type ForwardTarget = { channel_id: string } | { conversation_id: string }

export interface ForwardResult {
  message: Message
  /** O comentário, que vai logo depois como mensagem comum. */
  comment?: Message | null
}

export interface ForwardTargetChannel {
  id: string
  name: string
}

/** Servidor com os canais de texto em que você pode enviar. */
export interface ForwardTargetServer {
  id: string
  name: string
  icon_url?: string
  channels: ForwardTargetChannel[]
}

/** Encaminha a mensagem (a origem é a sala dela) para o destino, com comentário opcional. */
export function forwardMessage(
  message: Pick<Message, 'id' | 'channel_id' | 'conversation_id'>,
  target: ForwardTarget,
  comment: string
): Promise<ForwardResult> {
  const origin = message.channel_id
    ? `/channels/${message.channel_id}`
    : `/conversations/${message.conversation_id}`
  return request<ForwardResult>(`${origin}/messages/${message.id}/forward`, {
    method: 'POST',
    body: JSON.stringify({ ...target, comment })
  })
}

export async function listForwardTargets(): Promise<ForwardTargetServer[]> {
  const res = await request<{ servers: ForwardTargetServer[] }>('/forward/targets')
  return res.servers ?? []
}
