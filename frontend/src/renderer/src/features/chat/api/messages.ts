import { request } from '../../../shared/api/client'
import { sendTTSMessage, ttsTextOf } from '../../tts/api/tts'
import type { NameStyle } from '../../profile/lib/nameStyle'

export interface MessageAuthor {
  id: string
  username: string
  display_name: string
  avatar_url?: string | null
  name_style?: NameStyle
  /** Moldura do avatar (ausente = sem moldura). */
  avatar_decoration_url?: string | null
}

export interface ReplyPreview {
  id: string
  author_id: string
  author?: MessageAuthor
  content: string
}

export interface ReactionSummary {
  emoji: string
  count: number
  user_ids: string[]
}

export interface PollAnswer {
  answer_id: number
  text: string
  emoji?: string | null
  image_url?: string | null
  count: number
  me_voted: boolean
}

export interface Poll {
  question: string
  answers: PollAnswer[]
  allow_multiselect: boolean
  expires_at: string
  ended_at?: string | null
  total_voters: number
}

export type AttachmentKind = 'image' | 'video' | 'audio'

export interface Attachment {
  id: string
  kind: AttachmentKind
  content_type: string
  filename: string
  size_bytes: number
  width?: number | null
  height?: number | null
  duration_ms?: number | null
  /**
   * Só nos anexos de comentários de propostas: endereço público do arquivo. Sem
   * ele (chat) o arquivo é pedido com o token de mídia da sala.
   */
  url?: string | null
}

/** Menção em massa num canal: @all (todo mundo) ou @here (quem está online). */
export type MentionEveryone = 'all' | 'here'

/** Convite para a call de um canal de voz, embutido numa mensagem da DM. */
export interface CallInvite {
  call_id: string
  channel_id: string
  server_id?: string | null
  /** Nomes na hora do convite (a validade vem do estado da call). */
  channel_name?: string
  server_name?: string
}

export interface Message {
  id: string
  author_id: string
  author?: MessageAuthor
  channel_id?: string | null
  conversation_id?: string | null
  reply_to_id?: string | null
  reply_to?: ReplyPreview | null
  reactions?: ReactionSummary[]
  content: string
  /** Mensagem do próprio servidor (ex.: "birthday"). */
  system_kind?: string | null
  /**
   * Quem o backend deixou pingar com @all/@here (só dono/moderador, com
   * anti-spam). null = ninguém, mesmo com "@all" no texto.
   */
  mention_everyone?: MentionEveryone | null
  poll?: Poll | null
  /** Cartão de convite para a call (mensagem do convidador na DM). */
  call_invite?: CallInvite | null
  /** Mensagem /tts: lida em voz para quem está em call (features/tts). */
  tts?: boolean
  /** Canal de voz cuja call ouve a TTS; ausente em DM e em TTS antiga (ninguém ouve em canal). */
  tts_voice_channel_id?: string | null
  attachments?: Attachment[] | null
  sticker_id?: string | null
  sticker?: { id: string; server_id: string; name: string; content_type: string } | null
  gif_url?: string | null
  gif_metadata?: { width?: number; height?: number; preview_url?: string } | null
  created_at: string
  /** Quando o autor editou o texto pela última vez; ausente = nunca editada. */
  edited_at?: string | null
  /** Quando a mensagem foi fixada no canal; ausente = não fixada. */
  pinned_at?: string | null
}

export interface PinnedMessage extends Message {
  pinned_by?: MessageAuthor
  pinned_by_id?: string
  pinned_at: string
}

export interface PollAnswerInput {
  text: string
  emoji?: string
  image_url?: string
}

export interface CreatePollInput {
  question: string
  answers: PollAnswerInput[]
  duration_hours: number
  allow_multiselect: boolean
}

export const MESSAGE_LIMIT = 50

export function listChannelMessages(channelId: string, before?: string): Promise<Message[]> {
  const query = new URLSearchParams({ limit: String(MESSAGE_LIMIT) })
  if (before) query.set('before', before)
  return request<Message[]>(`/channels/${channelId}/messages?${query.toString()}`)
}

export interface ExtraMessageData {
  stickerId?: string | null
  gifUrl?: string | null
  gifMetadata?: { width?: number; height?: number; preview_url?: string } | null
}

export function sendChannelMessage(
  channelId: string,
  content: string,
  attachmentIds: string[] = [],
  replyToId?: string | null,
  extra?: ExtraMessageData
): Promise<Message> {
  // "/tts texto" vai pela rota própria (features/tts).
  const tts = ttsTextOf(content, attachmentIds, extra)
  if (tts !== null) return sendTTSMessage(`/channels/${channelId}`, tts)
  return request<Message>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      attachment_ids: attachmentIds,
      ...(replyToId ? { reply_to_id: replyToId } : {}),
      ...(extra?.stickerId ? { sticker_id: extra.stickerId } : {}),
      ...(extra?.gifUrl ? { gif_url: extra.gifUrl } : {}),
      ...(extra?.gifMetadata ? { gif_metadata: extra.gifMetadata } : {})
    })
  })
}

/** Edita o texto de uma mensagem sua (canal ou DM, pela sala). */
export function editMessage(room: string, messageId: string, content: string): Promise<Message> {
  return request<Message>(`${roomPath(room)}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content })
  })
}

export function deleteChannelMessage(channelId: string, messageId: string): Promise<void> {
  return request<void>(`/channels/${channelId}/messages/${messageId}`, { method: 'DELETE' })
}

export function listChannelPins(channelId: string): Promise<PinnedMessage[]> {
  return request<PinnedMessage[]>(`/channels/${channelId}/pins`)
}

export function pinChannelMessage(channelId: string, messageId: string): Promise<PinnedMessage> {
  return request<PinnedMessage>(`/channels/${channelId}/pins/${messageId}`, { method: 'PUT' })
}

export function unpinChannelMessage(channelId: string, messageId: string): Promise<void> {
  return request<void>(`/channels/${channelId}/pins/${messageId}`, { method: 'DELETE' })
}

export function addChannelReaction(
  channelId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  return request<void>(`/channels/${channelId}/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji })
  })
}

export function removeChannelReaction(
  channelId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  const query = new URLSearchParams({ emoji })
  return request<void>(
    `/channels/${channelId}/messages/${messageId}/reactions?${query.toString()}`,
    { method: 'DELETE' }
  )
}

export function listConversationMessages(
  conversationId: string,
  before?: string
): Promise<Message[]> {
  const query = new URLSearchParams({ limit: String(MESSAGE_LIMIT) })
  if (before) query.set('before', before)
  return request<Message[]>(`/conversations/${conversationId}/messages?${query.toString()}`)
}

export function sendConversationMessage(
  conversationId: string,
  content: string,
  attachmentIds: string[] = [],
  replyToId?: string | null,
  extra?: ExtraMessageData
): Promise<Message> {
  const tts = ttsTextOf(content, attachmentIds, extra)
  if (tts !== null) return sendTTSMessage(`/conversations/${conversationId}`, tts)
  return request<Message>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      attachment_ids: attachmentIds,
      ...(replyToId ? { reply_to_id: replyToId } : {}),
      ...(extra?.stickerId ? { sticker_id: extra.stickerId } : {}),
      ...(extra?.gifUrl ? { gif_url: extra.gifUrl } : {}),
      ...(extra?.gifMetadata ? { gif_metadata: extra.gifMetadata } : {})
    })
  })
}

export function deleteConversationMessage(
  conversationId: string,
  messageId: string
): Promise<void> {
  return request<void>(`/conversations/${conversationId}/messages/${messageId}`, {
    method: 'DELETE'
  })
}

export function addConversationReaction(
  conversationId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  return request<void>(`/conversations/${conversationId}/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji })
  })
}

export function removeConversationReaction(
  conversationId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  const query = new URLSearchParams({ emoji })
  return request<void>(
    `/conversations/${conversationId}/messages/${messageId}/reactions?${query.toString()}`,
    { method: 'DELETE' }
  )
}

/** Base da rota da sala: `/channels/:id` ou `/conversations/:id`. */
export function roomPath(room: string): string {
  return room.startsWith('channel:')
    ? `/channels/${room.slice('channel:'.length)}`
    : `/conversations/${room.slice('conversation:'.length)}`
}

export function createPoll(room: string, input: CreatePollInput): Promise<Message> {
  return request<Message>(`${roomPath(room)}/polls`, {
    method: 'POST',
    body: JSON.stringify(input)
  })
}

/** Troca o voto pelas respostas dadas; lista vazia remove o voto. */
export function votePoll(room: string, messageId: string, answerIds: number[]): Promise<Poll> {
  return request<Poll>(`${roomPath(room)}/messages/${messageId}/poll/votes`, {
    method: 'PUT',
    body: JSON.stringify({ answer_ids: answerIds })
  })
}

export function endPoll(room: string, messageId: string): Promise<Poll> {
  return request<Poll>(`${roomPath(room)}/messages/${messageId}/poll/end`, { method: 'POST' })
}
