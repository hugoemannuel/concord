import { request } from '../../../shared/api/client'

// Porte enxuto do api/messages do desktop: só o que o chat de texto usa nesta fatia.
export interface MessageAuthor {
  id: string
  username: string
  display_name: string
  avatar_url?: string | null
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
}

export interface MessageSticker {
  id: string
  server_id: string
  name: string
  content_type: string
}

export interface GifMetadata {
  width?: number
  height?: number
  preview_url?: string
}

/** De onde veio a mensagem encaminhada (cópia do desktop: features/chat/api/messages). */
export interface ForwardedFrom {
  message_id: string
  author_id: string
  author_name: string
  author_username?: string
  channel_id?: string | null
  channel_name?: string
  server_name?: string
  conversation_id?: string | null
  created_at: string
}

export interface Message {
  id: string
  author_id: string
  author?: MessageAuthor
  channel_id?: string | null
  conversation_id?: string | null
  content: string
  /** Mensagem do próprio servidor (o Maestro escreve como "music" e "music_commands"). */
  system_kind?: string | null
  attachments?: Attachment[] | null
  sticker_id?: string | null
  sticker?: MessageSticker | null
  /** Figurinha apagada na origem: sobrou o nome, para mostrar :nome:. */
  deleted_sticker_name?: string | null
  gif_url?: string | null
  gif_metadata?: GifMetadata | null
  created_at: string
  /** Quando o autor editou o texto pela última vez; ausente = nunca editada. */
  edited_at?: string | null
  /** Mensagem encaminhada: de onde ela veio (o conteúdo é o da original). */
  forwarded_from?: ForwardedFrom | null
}

export const MESSAGE_LIMIT = 50

export function listChannelMessages(channelId: string, before?: string): Promise<Message[]> {
  const query = new URLSearchParams({ limit: String(MESSAGE_LIMIT) })
  if (before) query.set('before', before)
  return request<Message[]>(`/channels/${channelId}/messages?${query.toString()}`)
}

/** GIF ou figurinha enviados no lugar (ou junto) do texto. */
export interface ExtraMessageData {
  /** Anexos já enviados (ids devolvidos pelo upload). */
  attachmentIds?: string[]
  stickerId?: string | null
  gifUrl?: string | null
  gifMetadata?: GifMetadata | null
}

const extraBody = (extra?: ExtraMessageData) => ({
  ...(extra?.attachmentIds?.length ? { attachment_ids: extra.attachmentIds } : {}),
  ...(extra?.stickerId ? { sticker_id: extra.stickerId } : {}),
  ...(extra?.gifUrl ? { gif_url: extra.gifUrl } : {}),
  ...(extra?.gifMetadata ? { gif_metadata: extra.gifMetadata } : {})
})

/** Resposta a um comando do bot (ex.: "/play"): o servidor trata o comando e não cria mensagem. */
export interface CommandAck {
  command: true
}

export const isCommandAck = (sent: Message | CommandAck): sent is CommandAck => 'command' in sent

export function sendChannelMessage(channelId: string, content: string, extra?: ExtraMessageData): Promise<Message | CommandAck> {
  return request<Message | CommandAck>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, attachment_ids: [], ...extraBody(extra) })
  })
}

export function listConversationMessages(conversationId: string, before?: string): Promise<Message[]> {
  const query = new URLSearchParams({ limit: String(MESSAGE_LIMIT) })
  if (before) query.set('before', before)
  return request<Message[]>(`/conversations/${conversationId}/messages?${query.toString()}`)
}

export function sendConversationMessage(conversationId: string, content: string, extra?: ExtraMessageData): Promise<Message> {
  return request<Message>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, attachment_ids: [], ...extraBody(extra) })
  })
}
