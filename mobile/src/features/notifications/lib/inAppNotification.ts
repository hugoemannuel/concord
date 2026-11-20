import type { Message } from '../../chat/api/messages'
import type { ActiveRoom } from '../../chat/lib/unreadCounts'

export interface InAppNotification {
  title: string
  body: string
  /** Mesmo formato do `data` do push (notificationRoute): o toque abre a conversa ou o canal. */
  data: Record<string, unknown>
}

const MAX_BODY = 140
const NO_TEXT = 'Enviou um anexo'
// Mesma regra de token do push (backend/internal/push/mentions.go): o "@" abre a palavra (não vale em e-mail) e o
// nick é a palavra inteira: letra (com acento), número, "_" ou "-" logo depois continuam a palavra, então
// "@equipe-de-suporte" não cita "equipe".
const MENTION = /(?:^|[\s(\[{,;:!?"'])@([a-z0-9_]{3,32})(?![\p{L}\p{N}_-])/giu

/** O texto cita a pessoa (@usuário), como o push decide. */
function mentions(content: string, username: string): boolean {
  const me = username.toLowerCase()
  for (const m of content.matchAll(MENTION)) {
    if (m[1].toLowerCase() === me) return true
  }
  return false
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** O texto sem os "@handle" dos cargos pingados: ali é o cargo, não a pessoa de mesmo nick. */
function withoutRoleHandles(message: Message): string {
  let text = message.content
  for (const role of message.mention_roles ?? []) {
    text = text.replace(new RegExp(`@${escapeRegExp(role.handle)}(?![\\p{L}\\p{N}_-])`, 'giu'), ' ')
  }
  return text
}

/**
 * A mensagem de canal me alcança? Pelo @usuário, pelo @all que o servidor liberou (mention_everyone; @here não,
 * como o push) ou por um cargo meu (mention_roles).
 */
function reachesMe(message: Message, username: string, myRoleIds: readonly string[]): boolean {
  if (message.mention_everyone === 'all') return true
  if (message.mention_roles?.some((r) => myRoleIds.includes(r.id))) return true
  return mentions(withoutRoleHandles(message), username)
}

const bodyOf = (content: string): string => (content.trim() === '' ? NO_TEXT : content.slice(0, MAX_BODY))

/**
 * Com o app aberto o servidor não manda push (ele só vai para o celular com o app fechado): o próprio app avisa
 * de DM e de menção, como o Discord, fora da conversa que está aberta na tela. Devolve null quando não avisa.
 */
export function inAppNotificationFor(
  payload: { message?: Message; server_id?: string },
  me: { id: string; username: string },
  active: ActiveRoom | null,
  /** Os meus cargos no servidor da mensagem (myRolesStore). */
  myRoleIds: readonly string[] = []
): InAppNotification | null {
  const message = payload.message
  if (!message || message.author_id === me.id || message.system_kind) return null
  const title = message.author?.display_name || message.author?.username || 'Mensagem'
  if (message.conversation_id) {
    if (active?.kind === 'conversation' && active.id === message.conversation_id) return null
    return { title, body: bodyOf(message.content), data: { type: 'dm', conversation_id: message.conversation_id, name: title, in_app: true } }
  }
  if (!message.channel_id || !reachesMe(message, me.username, myRoleIds)) return null
  if (active?.kind === 'channel' && active.id === message.channel_id) return null
  return {
    title,
    body: bodyOf(message.content),
    data: { type: 'mention', channel_id: message.channel_id, server_id: payload.server_id ?? '', name: '', in_app: true }
  }
}
