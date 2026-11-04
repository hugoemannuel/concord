import type { Message } from '../api/messages'
import { dayKey } from './messageDates'

/**
 * Agrupamento de mensagens seguidas, como no Discord: a primeira da sequência
 * mostra avatar, nome e hora; as seguintes aparecem só com o texto.
 *
 * É decidido na renderização, sobre a lista já ordenada por mergeMessages
 * (created_at, id) e olhando só a mensagem imediatamente anterior. Assim não
 * depende da ordem de chegada nem de quantas páginas já foram carregadas: ao
 * carregar mensagens mais antigas o par na emenda é reavaliado sozinho.
 */

/** Janela do Discord: a 7 minutos ou mais da anterior, começa um grupo novo. */
export const GROUP_WINDOW_MS = 7 * 60 * 1000

/** O que o agrupamento lê de uma mensagem. */
export type GroupableMessage = Pick<
  Message,
  | 'author_id'
  | 'channel_id'
  | 'conversation_id'
  | 'created_at'
  | 'reply_to_id'
  | 'reply_to'
  | 'system_kind'
  | 'poll'
>

/** Sistema (música, aniversário...) e enquete nunca fazem parte de um grupo. */
function isSpecial(m: GroupableMessage): boolean {
  return Boolean(m.system_kind || m.poll)
}

/** Resposta abre grupo, mas pode ser a primeira de um (como no Discord). */
function isReply(m: GroupableMessage): boolean {
  return Boolean(m.reply_to_id || m.reply_to)
}

/**
 * `message` entra no grupo de `previous` (vira linha compacta)? Só se for do
 * mesmo autor, no mesmo canal/conversa, a menos de 7 minutos, no mesmo dia, e
 * a mensagem não for resposta e nenhuma das duas for sistema ou enquete.
 * Uma resposta pode abrir o grupo: a próxima mensagem comum dela se agrupa.
 */
export function isGroupedWithPrevious(
  message: GroupableMessage,
  previous: GroupableMessage | undefined
): boolean {
  if (!previous) return false
  if (message.author_id !== previous.author_id) return false
  if ((message.channel_id ?? null) !== (previous.channel_id ?? null)) return false
  if ((message.conversation_id ?? null) !== (previous.conversation_id ?? null)) return false
  if (isReply(message) || isSpecial(message) || isSpecial(previous)) return false

  const now = new Date(message.created_at)
  const before = new Date(previous.created_at)
  const gap = now.getTime() - before.getTime()
  // NaN (data inválida) ou ordem trocada: na dúvida, mostra o cabeçalho.
  if (!(gap >= 0 && gap < GROUP_WINDOW_MS)) return false
  return dayKey(message.created_at) === dayKey(previous.created_at)
}
