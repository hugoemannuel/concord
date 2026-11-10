import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../shared/api/client'
import { onRealtimeReconnect, realtime } from '../../../shared/api/realtime'
import { onWsEvent, type WsEvent } from '../../../shared/api/ws'
import { markConversationRead } from '../api/conversations'
import {
  listChannelMessages,
  listConversationMessages,
  MESSAGE_LIMIT,
  sendChannelMessage,
  isCommandAck,
  sendConversationMessage,
  type CommandAck,
  type ExtraMessageData,
  type Message
} from '../api/messages'
import { mergeMessages, oldestId, removeMessage } from '../lib/messageList'
import { sendOutcomeOf, type SendOutcome } from '../lib/sendOutcome'

export type LoadStatus = 'loading' | 'ready' | 'error'
export type { SendOutcome }

/** O que o chat mostra: um canal de texto ou uma conversa (DM ou grupo). */
export interface ChatTarget {
  kind: 'channel' | 'conversation'
  id: string
}

type EventPayload = { message?: Message; message_id?: string; channel_id?: string; conversation_id?: string }

const belongsTo = (target: ChatTarget, ids: { channel_id?: string | null; conversation_id?: string | null }): boolean =>
  (target.kind === 'channel' ? ids.channel_id : ids.conversation_id) === target.id

/** Aplica um evento do WebSocket à lista deste chat (null = não é deste chat/evento). */
function applyEvent(current: Message[], event: WsEvent, target: ChatTarget): Message[] | null {
  const payload = event.payload as EventPayload
  if (event.type === 'message:create' || event.type === 'message:update') {
    return payload.message && belongsTo(target, payload.message) ? mergeMessages(current, [payload.message]) : null
  }
  if (event.type === 'message:delete' && payload.message_id && belongsTo(target, payload)) {
    return removeMessage(current, payload.message_id)
  }
  return null
}

function fetchPage(target: ChatTarget, before?: string): Promise<Message[]> {
  const list = target.kind === 'channel' ? listChannelMessages : listConversationMessages
  return before ? list(target.id, before) : list(target.id)
}

const sendTo = (target: ChatTarget, content: string, extra?: ExtraMessageData): Promise<Message | CommandAck> =>
  target.kind === 'channel' ? sendChannelMessage(target.id, content, extra) : sendConversationMessage(target.id, content, extra)

/** Histórico, tempo real e envio do chat de um canal de texto ou de uma conversa. */
export function useRoomMessages(target: ChatTarget) {
  const { kind, id } = target
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [hasMore, setHasMore] = useState(true)
  const currentKey = useRef(`${kind}:${id}`)
  const loadingMore = useRef(false)
  const key = `${kind}:${id}`
  currentKey.current = key

  /** Busca a página mais recente e junta; respostas de outro chat (já trocado) são descartadas. */
  const fetchLatest = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) setStatus('loading')
      try {
        const page = await fetchPage({ kind, id })
        if (currentKey.current !== key) return
        setMessages((current) => mergeMessages(current, page))
        if (showLoading) setHasMore(page.length >= MESSAGE_LIMIT)
        setStatus('ready')
      } catch {
        if (currentKey.current === key && showLoading) setStatus('error')
      }
    },
    [kind, id, key]
  )

  useEffect(() => {
    setMessages([])
    setHasMore(true)
    void fetchLatest(true)
    // Abrir a conversa a marca como lida (o desktop para de mostrar não lida).
    if (kind === 'conversation') void markConversationRead(id).catch(() => {})
  }, [fetchLatest, kind, id])

  useEffect(() => {
    const room = key
    realtime.subscribe(room)
    const offEvents = onWsEvent((event) => {
      setMessages((current) => applyEvent(current, event, { kind, id }) ?? current)
      const incoming = (event.payload as EventPayload | null)?.message
      if (kind === 'conversation' && event.type === 'message:create' && incoming && belongsTo({ kind, id }, incoming)) {
        void markConversationRead(id).catch(() => {})
      }
    })
    const offReconnect = onRealtimeReconnect(() => void fetchLatest(false))
    return () => {
      realtime.unsubscribe(room)
      offEvents()
      offReconnect()
    }
  }, [key, kind, id, fetchLatest])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore.current || status !== 'ready') return
    loadingMore.current = true
    try {
      const page = await fetchPage({ kind, id }, oldestId(messages))
      if (currentKey.current !== key) return
      setMessages((current) => mergeMessages(current, page))
      setHasMore(page.length >= MESSAGE_LIMIT)
    } catch {
      // a próxima rolagem tenta de novo
    } finally {
      loadingMore.current = false
    }
  }, [kind, id, key, hasMore, messages, status])

  const send = useCallback(
    async (text: string, extra?: ExtraMessageData): Promise<SendOutcome> => {
      const content = text.trim()
      if (!content && !extra) return 'empty'
      try {
        const sent = await sendTo({ kind, id }, content, extra)
        if (!isCommandAck(sent)) setMessages((current) => mergeMessages(current, [sent]))
        return 'ok'
      } catch (err) {
        return sendOutcomeOf(err)
      }
    },
    [kind, id]
  )

  const retry = useCallback(() => fetchLatest(true), [fetchLatest])

  return { messages, status, hasMore, loadMore, send, retry }
}
