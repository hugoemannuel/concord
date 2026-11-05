import type { ConversationSummary } from '../api/conversations'
import type { Message } from '../api/messages'
import { conversationTitle, sortConversations } from './conversationList'

/** O chat aberto agora (canal ou conversa); null = nenhum. */
export interface ActiveRoom {
  kind: 'channel' | 'conversation'
  id: string
}

/** Conta como não lida: mensagem de outra pessoa num chat que não está aberto. */
export function shouldCountUnread(message: Message, myId: string | undefined, active: ActiveRoom | null): boolean {
  if (message.author_id === myId) return false
  if (!active) return true
  const id = active.kind === 'channel' ? message.channel_id : message.conversation_id
  return id !== active.id
}

export const totalUnread = (conversations: ConversationSummary[]): number =>
  conversations.reduce((sum, c) => sum + c.unread_count, 0)

/** Quantas DMs não lidas aparecem no trilho (como no Discord); as outras ficam no selo das DMs. */
export const MAX_RAIL_DMS = 5

/** Uma DM não lida no trilho (o que basta para mostrar e abrir a conversa). */
export interface RailDm {
  id: string
  title: string
  type: 'dm' | 'group'
  avatarUrl?: string | null
  unread: number
}

/** As conversas com não lidas que vão para o trilho, da mensagem mais nova para a mais velha. */
export const unreadRailDms = (conversations: ConversationSummary[]): ConversationSummary[] =>
  sortConversations(conversations.filter((c) => c.unread_count > 0)).slice(0, MAX_RAIL_DMS)

/** O que o trilho mostra de cada DM não lida: a foto de quem mandou (no grupo, o ícone dele). */
export const railDmsOf = (conversations: ConversationSummary[], myId: string | undefined): RailDm[] =>
  unreadRailDms(conversations).map((c) => ({
    id: c.id,
    title: conversationTitle(c, myId),
    type: c.type,
    avatarUrl: c.type === 'dm' ? c.other_user?.avatar_url : c.icon_url,
    unread: c.unread_count
  }))

/** Texto do selo: 99+ para não estourar o círculo. */
export const badgeText = (count: number): string => (count > 99 ? '99+' : String(count))

/** Rótulo para leitor de tela. */
export const unreadLabel = (count: number): string =>
  count === 1 ? '1 mensagem não lida' : `${count} mensagens não lidas`
