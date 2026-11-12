// Mudanças em mensagens já enviadas: edição, exclusão, fixar, reações e enquetes.
import type { Message, PinnedMessage } from '../../api/messages'
import type { ChatState, RoomKey } from '../chatStore'
import { roomKeyOf, type ChatWsContext, type Payload, type WsHandler } from './context'
import {
  clearDeletedReplyTarget,
  mapRoomMessage,
  replacePoll,
  withUpdatedMessage
} from '../../lib/roomMessages'
import { applyReactionAdd, applyReactionRemove } from '../../lib/emotes'
import { applyPollUpdate, type PollUpdate } from '../../lib/polls'
import { usePinStore } from '../pinStore'
import { useAuthStore } from '../../../auth/store/authStore'

/** Desconta uma não lida (sem passar de zero). */
const dropOne = (map: Record<string, number>, key: string): Record<string, number> => {
  const current = map[key] ?? 0
  return current > 0 ? { ...map, [key]: current - 1 } : map
}

/**
 * A mensagem sai da sala e desconta uma não lida da sala (e do servidor, se é
 * canal). Apagada pelo prazo (`expired`) não desconta: quase sempre já foi lida.
 */
export function withDeletedMessage(
  state: ChatState,
  del: {
    room: RoomKey
    messageId: string
    channelId?: string
    serverId: string | null
    expired?: boolean
  }
): Partial<ChatState> {
  const messagesByRoom = {
    ...state.messagesByRoom,
    [del.room]: clearDeletedReplyTarget(state.messagesByRoom[del.room] ?? [], del.messageId)
  }
  if (del.expired) return { messagesByRoom }
  return {
    messagesByRoom,
    unreadByRoom: dropOne(state.unreadByRoom, del.room),
    unreadByServer:
      del.serverId && del.channelId
        ? dropOne(state.unreadByServer, del.serverId)
        : state.unreadByServer
  }
}

/** A mensagem apagada era a prévia da DM na lista de conversas. */
const isConversationPreview = (state: ChatState, conversationId: string, messageId: string): boolean =>
  state.conversations.some((c) => c.id === conversationId && c.last_message?.id === messageId)

const handleUpdate: WsHandler = (payload, ctx) => {
  const msg = payload.message as Message | undefined
  if (!msg?.id) return
  usePinStore.getState().onMessageUpdate(msg)
  const room = roomKeyOf(msg.channel_id, msg.conversation_id)
  if (!room.endsWith(':')) ctx.set((state) => withUpdatedMessage(state, room, msg))
}

const handleDelete: WsHandler = (payload, ctx) => {
  const messageId = payload.message_id as string
  if (messageId) usePinStore.getState().onMessageDelete(messageId)
  const channelId = payload.channel_id as string | undefined
  const conversationId = payload.conversation_id as string | undefined
  const room = roomKeyOf(channelId, conversationId)
  const serverId = (payload.server_id as string) || null
  const expired = payload.expired === true
  ctx.set((state) => withDeletedMessage(state, { room, messageId, channelId, serverId, expired }))
  if (conversationId && isConversationPreview(ctx.get(), conversationId, messageId)) {
    void ctx.get().fetchConversations()
  }
}

/** Marca (ou desmarca, com null) a mensagem como fixada na lista do canal. */
const setPinnedAt = (
  ctx: ChatWsContext,
  channelId: string,
  messageId: string,
  pinnedAt: string | null
): void =>
  ctx.set((state) => ({
    messagesByRoom: mapRoomMessage(
      state.messagesByRoom,
      `channel:${channelId}`,
      messageId,
      (m) => ({
        ...m,
        pinned_at: pinnedAt
      })
    )
  }))

const handlePinAdd: WsHandler = (payload, ctx) => {
  const channelId = payload.channel_id as string
  const pinMsg = payload.message as PinnedMessage | undefined
  if (!channelId || !pinMsg?.id) return
  usePinStore.getState().onPinAdd(channelId, pinMsg)
  setPinnedAt(ctx, channelId, pinMsg.id, pinMsg.pinned_at)
}

const handlePinRemove: WsHandler = (payload, ctx) => {
  const channelId = payload.channel_id as string
  const messageId = payload.message_id as string
  if (!channelId || !messageId) return
  usePinStore.getState().onPinRemove(channelId, messageId)
  setPinnedAt(ctx, channelId, messageId, null)
}

interface ReactionEvent {
  room: RoomKey
  messageId: string
  userId: string
  emoji: string
}

/** Os dados da reação, ou null se falta algum. */
export function reactionOf(payload: Payload): ReactionEvent | null {
  const reaction = {
    room: roomKeyOf(
      payload.channel_id as string | undefined,
      payload.conversation_id as string | undefined
    ),
    messageId: payload.message_id as string,
    userId: payload.user_id as string,
    emoji: payload.emoji as string
  }
  if (reaction.room.endsWith(':') || !reaction.messageId || !reaction.userId || !reaction.emoji) {
    return null
  }
  return reaction
}

const handleReaction: WsHandler = (payload, ctx, event) => {
  const r = reactionOf(payload)
  if (!r) return
  const apply = event.type === 'message:reaction:add' ? applyReactionAdd : applyReactionRemove
  ctx.set((state) => ({
    messagesByRoom: mapRoomMessage(state.messagesByRoom, r.room, r.messageId, (m) => ({
      ...m,
      reactions: apply(m.reactions, r.emoji, r.userId)
    }))
  }))
}

const handlePollUpdate: WsHandler = (payload, ctx) => {
  const update = payload as unknown as PollUpdate & {
    message_id: string
    channel_id?: string
    conversation_id?: string
  }
  const room = roomKeyOf(update.channel_id, update.conversation_id)
  const meId = useAuthStore.getState().user?.id ?? null
  ctx.set((state) => ({
    messagesByRoom: replacePoll(state.messagesByRoom, room, update.message_id, (current) =>
      applyPollUpdate(current, update, meId)
    )
  }))
}

export const MESSAGE_HANDLERS: Record<string, WsHandler> = {
  'message:update': handleUpdate,
  'message:delete': handleDelete,
  'channel:pin:add': handlePinAdd,
  'channel:pin:remove': handlePinRemove,
  'message:reaction:add': handleReaction,
  'message:reaction:remove': handleReaction,
  'message:poll:update': handlePollUpdate
}
