/**
 * Encaminhar mensagens (como no Discord): o que dá para encaminhar, a origem
 * mostrada na encaminhada, os destinos do seletor e o aviso de erro.
 */
import { ApiError } from '../../../shared/api/client'
import type { ConversationSummary } from '../api/conversations'
import type { ForwardTarget, ForwardTargetServer } from '../api/forward'
import type { ForwardedFrom, Message } from '../api/messages'
import { isBotUser } from '../../music/lib/bots'
import { conversationTitle } from './conversations'
import { slowmodeErrorText, slowmodeRetryAfter } from './slowmode'

/** Tem o que copiar e não é enquete, convite para call nem aviso do sistema. */
export function canForward(message: Message): boolean {
  if (message.system_kind || message.poll || message.call_invite) return false
  return Boolean(
    message.content.trim() ||
    message.attachments?.length ||
    message.sticker_id ||
    message.gif_url ||
    message.deleted_sticker_name
  )
}

export interface ForwardOriginView {
  author: string
  /** "#canal · Servidor" ou "Mensagem direta". */
  place: string
}

export function forwardOrigin(ff: ForwardedFrom): ForwardOriginView {
  const author = ff.author_name || ff.author_username || 'Alguém'
  if (!ff.channel_id) return { author, place: 'Mensagem direta' }
  const channel = `#${ff.channel_name || 'canal'}`
  return { author, place: ff.server_name ? `${channel} · ${ff.server_name}` : channel }
}

export interface ForwardDestination {
  key: string
  kind: 'channel' | 'conversation'
  label: string
  hint: string
  target: ForwardTarget
  avatar?: { userId: string; url?: string | null }
  iconUrl?: string
}

function conversationDestination(c: ConversationSummary, meId: string | undefined): ForwardDestination {
  const group = c.type === 'group'
  return {
    key: `conversation:${c.id}`,
    kind: 'conversation',
    label: conversationTitle(c, meId),
    hint: group ? 'Grupo' : (c.other_user?.username ?? ''),
    target: { conversation_id: c.id },
    avatar: !group && c.other_user ? { userId: c.other_user.id, url: c.other_user.avatar_url } : undefined
  }
}

/** As conversas (menos a DM com bot, que é só leitura) e depois os canais de cada servidor. */
export function forwardDestinations(
  servers: ForwardTargetServer[],
  conversations: ConversationSummary[],
  meId: string | undefined
): ForwardDestination[] {
  const out = conversations
    .filter((c) => c.type === 'group' || !isBotUser(c.other_user?.id))
    .map((c) => conversationDestination(c, meId))
  for (const s of servers) {
    for (const ch of s.channels) {
      out.push({
        key: `channel:${ch.id}`,
        kind: 'channel',
        label: `#${ch.name}`,
        hint: s.name,
        target: { channel_id: ch.id },
        iconUrl: s.icon_url
      })
    }
  }
  return out
}

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Busca no nome e na dica (servidor ou @usuário), sem acento nem caixa. */
export function filterDestinations(items: ForwardDestination[], query: string): ForwardDestination[] {
  const q = fold(query.trim())
  if (!q) return items
  return items.filter((d) => fold(d.label).includes(q) || fold(d.hint).includes(q))
}

const ERROR_BY_CODE: Record<string, string> = {
  blocked: 'Você não pode enviar mensagens para essa pessoa.',
  bot_conversation: 'Essa conversa é só de leitura.',
  not_forwardable: 'Essa mensagem não pode ser encaminhada.'
}

const ERROR_BY_STATUS: Record<number, string> = {
  403: 'Você não tem permissão para enviar mensagens aí.',
  404: 'A mensagem ou o destino não existe mais.',
  507: 'O servidor está sem espaço para os arquivos.'
}

export function forwardErrorMessage(err: unknown): string {
  const retryAfter = slowmodeRetryAfter(err)
  if (retryAfter !== null) return slowmodeErrorText(retryAfter)
  if (err instanceof ApiError) {
    const text = (err.code && ERROR_BY_CODE[err.code]) || ERROR_BY_STATUS[err.status]
    if (text) return text
  }
  return 'Não foi possível encaminhar a mensagem.'
}
