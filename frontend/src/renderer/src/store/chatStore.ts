import { create } from 'zustand'
import type { ServerMember } from '../api/servers'
import {
  deliverDesktop,
  friendRequestNotification,
  proposalMentionNotification,
  mentionNotification,
  messageAlert,
  messageNotification,
  notificationSound,
  notifyDesktop
} from '../lib/notifications'
import { playSound } from '../lib/sounds'
import { notificationPrefs } from './notificationPrefsStore'
import { useAuthStore } from './authStore'
import { WsClient, type WsEvent } from '../api/ws'
import type { CreatePollInput, Message, Poll } from '../api/messages'
import type { Server } from '../api/servers'
import {
  listChannelMessages,
  sendChannelMessage,
  deleteChannelMessage,
  addChannelReaction,
  removeChannelReaction,
  listConversationMessages,
  sendConversationMessage,
  deleteConversationMessage,
  editMessage,
  addConversationReaction,
  removeConversationReaction,
  createPoll,
  votePoll,
  endPoll
} from '../api/messages'
import { applyReactionAdd, applyReactionRemove } from '../lib/emotes'
import { applyPollUpdate, messagePreview, type PollUpdate } from '../lib/polls'
import { mergeMissedMessages, newestMessage } from '../lib/missedMessages'
import { mergeMessages } from '../lib/messageOrder'
import { applyMessageUpdate } from '../lib/messageEdit'
import { APP_UPDATE_EVENT, requestUpdateCheck } from '../lib/appUpdate'
import type { ConversationSummary } from '../api/conversations'
import { listConversations, markConversationRead } from '../api/conversations'
import { conversationTitle, sanitizeConversations } from '../lib/conversations'
import type { PresenceMap } from '../api/presence'
import { fetchActivities, fetchPresence } from '../api/presence'
import { listChannels } from '../api/channels'
import { useChannelNameStore } from './channelNameStore'
import { useServerStore } from './serverStore'
import { handleServerRoleEvent, removedMessage } from './serverEvents'
import { useFriendStore } from './friendStore'
import { useCallStore } from './callStore'
import { useBoostStore } from './boostStore'
import { useLevelStore } from './levelStore'
import { useBadgeStore } from './badgeStore'
import { useProposalStore } from './proposalStore'
import { useNotifySettingsStore } from './notifySettingsStore'
import { mentionKindOf, muteDecision } from '../lib/notificationMute'
import { MAESTRO_USER_ID } from '../lib/music'
import { useSoundboardStore } from './soundboardStore'
import { useMusicStore } from './musicStore'
import { usePinStore } from './pinStore'
import type { PinnedMessage } from '../api/messages'
import { useActivityStore } from './activityStore'
import { useTypingStore } from './typingStore'
import { usePresenceActivityStore } from './presenceActivityStore'
import { sanitizeActivity } from '../lib/presenceActivity'
import { showToast, useToastStore } from './toastStore'
import { createReconnectNotice } from '../lib/wsReconnect'
import { router } from '../router'
import { MESSAGE_LIMIT } from '../api/messages'
import type { PublicProfile } from '../api/users'
import { useProfileStore } from './profileStore'
import { prefsForStatus, presenceStatusOf, type PresenceStatus } from '../lib/presenceStatus'

export type RoomKey = string

interface ChatState {
  messagesByRoom: Record<RoomKey, Message[]>
  hasMoreByRoom: Record<RoomKey, boolean>
  loadingByRoom: Record<RoomKey, boolean>
  unreadByRoom: Record<RoomKey, number>
  unreadByServer: Record<string, number>
  /** Menções a mim ainda não vistas (selo vermelho), por sala e por servidor. */
  mentionsByRoom: Record<RoomKey, number>
  mentionsByServer: Record<string, number>
  channelsByServer: Record<string, string[]>
  activeRoom: RoomKey | null
  presence: Record<string, boolean>
  /** Status de cada pessoa como os outros veem (invisível = offline). */
  statuses: Record<string, PresenceStatus>
  conversations: ConversationSummary[]
  conversationsLoading: boolean
  connect: () => void
  disconnect: () => void
  isWsConnected: () => boolean
  openRoom: (room: RoomKey) => Promise<void>
  closeRoom: (room: RoomKey) => void
  openServer: (serverId: string) => void
  closeServer: (serverId: string) => void
  loadOlder: (room: RoomKey) => Promise<void>
  sendToRoom: (
    room: RoomKey,
    content: string,
    attachmentIds?: string[],
    replyToId?: string | null
  ) => Promise<void>
  deleteFromRoom: (room: RoomKey, messageId: string) => Promise<void>
  /** Edita o texto de uma mensagem sua; a lista já sai com a versão do servidor. */
  editInRoom: (room: RoomKey, messageId: string, content: string) => Promise<void>
  toggleReaction: (room: RoomKey, messageId: string, emoji: string) => Promise<void>
  createPollInRoom: (room: RoomKey, input: CreatePollInput) => Promise<void>
  votePollInRoom: (room: RoomKey, messageId: string, answerIds: number[]) => Promise<void>
  endPollInRoom: (room: RoomKey, messageId: string) => Promise<void>
  fetchConversations: () => Promise<void>
  fetchPresenceFor: (userIds: string[]) => Promise<void>
  fetchChannelsForServers: (serverIds: string[]) => Promise<void>
  sendEvent: (type: string, payload: unknown) => void
  subscribeRoom: (room: RoomKey) => void
  unsubscribeRoom: (room: RoomKey) => void
  handleWsEvent: (event: WsEvent) => void
  /** WS voltou (ex.: deploy): busca o que se perdeu na queda, sem som nem notificação. */
  resyncAfterReconnect: () => Promise<void>
  handleServerDeleted: (serverId: string) => void
  reset: () => void
}

const getRoomFetch = (room: RoomKey): ((before?: string) => Promise<Message[]>) => {
  if (room.startsWith('channel:')) {
    const id = room.slice('channel:'.length)
    return (before?: string) => listChannelMessages(id, before)
  }
  const id = room.slice('conversation:'.length)
  return (before?: string) => listConversationMessages(id, before)
}

/**
 * Salas com um ChatPane aberto. Só elas guardam lista de mensagens: o
 * message:create de uma sala fechada (DM pela sala user:<eu>, canal pela sala
 * do servidor) não pode criar uma lista solta que depois seria juntada à
 * página carregada ao abrir. São também as que a reconexão relê
 * (resyncAfterReconnect); `loaded` diz se o histórico já veio, para uma sala
 * cuja primeira carga falhou ser carregada ali em vez de contar a página
 * inteira como não lida.
 */
const openRooms = new Map<RoomKey, { loaded: boolean }>()

const clearDeletedReplyTarget = (messages: Message[], deletedId: string): Message[] =>
  messages
    .filter((m) => m.id !== deletedId)
    .map((m) => (m.reply_to_id === deletedId ? { ...m, reply_to: null } : m))

/**
 * Aplica uma mensagem editada à sala (se carregada) e à prévia da DM, quando
 * ela é a última da conversa. Não mexe em não lidas nem notifica: editar não
 * é mensagem nova.
 */
const withUpdatedMessage = (
  state: Pick<ChatState, 'messagesByRoom' | 'conversations'>,
  room: RoomKey,
  msg: Message
): Partial<ChatState> => {
  const current = state.messagesByRoom[room]
  const next: Partial<ChatState> = {}
  if (current) {
    const updated = applyMessageUpdate(current, msg)
    if (updated !== current) next.messagesByRoom = { ...state.messagesByRoom, [room]: updated }
  }
  if (msg.conversation_id) {
    const idx = state.conversations.findIndex(
      (c) => c.id === msg.conversation_id && c.last_message?.id === msg.id
    )
    if (idx !== -1) {
      const conversations = [...state.conversations]
      const conv = conversations[idx]
      conversations[idx] = {
        ...conv,
        last_message: { ...conv.last_message!, content: messagePreview(msg) }
      }
      next.conversations = conversations
    }
  }
  return next
}

/** Troca a enquete de uma mensagem carregada na sala (sem efeito se não estiver). */
const replacePoll = (
  messagesByRoom: Record<RoomKey, Message[]>,
  room: RoomKey,
  messageId: string,
  next: (current: Poll | null | undefined) => Poll
): Record<RoomKey, Message[]> => {
  const messages = messagesByRoom[room]
  if (!messages?.some((m) => m.id === messageId)) return messagesByRoom
  return {
    ...messagesByRoom,
    [room]: messages.map((m) => (m.id === messageId ? { ...m, poll: next(m.poll) } : m))
  }
}

/** Releitura de presença e listas depois de reconectar (ver resyncAfterReconnect). */
const LISTS_RESYNC_DELAY_MS = 3000
let listsResyncTimer: ReturnType<typeof setTimeout> | null = null

/** Aviso "Reconectando…" só se o servidor demorar (um deploy leva menos de 3 s). */
let reconnectToastId: string | null = null
const dismissReconnectToast = (): void => {
  if (reconnectToastId) useToastStore.getState().removeToast(reconnectToastId)
  reconnectToastId = null
}
const reconnectNotice = createReconnectNotice({
  onSlow: () => {
    reconnectToastId = showToast.info('Reconectando ao servidor…', 0)
  },
  onBack: () => {
    dismissReconnectToast()
    showToast.success('Conectado ao servidor de novo.')
  },
  onDismiss: dismissReconnectToast
})

// Marca a DM como lida no servidor, juntando rajadas de mensagens.
const readTimers = new Map<string, ReturnType<typeof setTimeout>>()
function markReadSoon(conversationId: string, messageId?: string): void {
  const pending = readTimers.get(conversationId)
  if (pending) clearTimeout(pending)
  readTimers.set(
    conversationId,
    setTimeout(() => {
      readTimers.delete(conversationId)
      markConversationRead(conversationId, messageId).catch((err) =>
        console.error('[chatStore] markRead failed:', err)
      )
    }, 400)
  )
}

/** A janela (ou a aba, no web) está à vista e com foco. */
const windowFocused = (): boolean => document.visibilityState !== 'hidden' && document.hasFocus()

const isBlocked = (userId: string): boolean =>
  useFriendStore.getState().blocked.some((u) => u.id === userId)

const client = new WsClient({
  getToken: () => useAuthStore.getState().accessToken,
  getUserId: () => useAuthStore.getState().user?.id ?? null,
  onEvent: (event) => useChatStore.getState().handleWsEvent(event),
  onOpen: (reconnected) => {
    reconnectNotice.restored()
    // Avisos de digitando de antes da queda podem nunca receber o stop.
    useTypingStore.getState().reset()
    useCallStore.getState().handleWsReconnect()
    // O servidor perdeu o jogo em andamento na queda: manda de novo.
    usePresenceActivityStore.getState().publishMine()
    // Reconexão costuma ser deploy: checa atualização (o aviso app:update é o
    // caminho principal; isto cobre o manifesto publicado antes do reinício).
    requestUpdateCheck()
    if (reconnected) void useChatStore.getState().resyncAfterReconnect()
  },
  onLost: () => reconnectNotice.lost()
})

/** Mensagens que já geraram notificação (chegam por mais de uma sala). */
const notifiedMessages = new Set<string>()

export const useChatStore = create<ChatState>()((set, get) => ({
  messagesByRoom: {},
  hasMoreByRoom: {},
  loadingByRoom: {},
  unreadByRoom: {},
  unreadByServer: {},
  mentionsByRoom: {},
  mentionsByServer: {},
  channelsByServer: {},
  activeRoom: null,
  presence: {},
  statuses: {},
  conversations: [],
  conversationsLoading: false,

  connect: () => {
    client.connect()
    get().fetchConversations()
    void useLevelStore.getState().loadMe()
    void useNotifySettingsStore.getState().fetchSettings()
  },
  disconnect: () => {
    client.disconnect()
    reconnectNotice.cancel()
    if (listsResyncTimer) clearTimeout(listsResyncTimer)
    listsResyncTimer = null
    get().reset()
    useLevelStore.getState().reset()
    useBoostStore.getState().reset()
    useBadgeStore.getState().reset()
    useProposalStore.getState().reset()
    useNotifySettingsStore.getState().reset()
  },
  isWsConnected: () => client.isConnected(),

  openRoom: async (room) => {
    // Reabrir a sala carrega o histórico de novo (closeRoom apaga a lista).
    openRooms.set(room, { loaded: false })
    client.subscribe(room)
    const fetch = getRoomFetch(room)
    const token = useAuthStore.getState().accessToken
    set((state) => {
      const channelId = room.startsWith('channel:') ? room.slice('channel:'.length) : null
      let unreadByServer = state.unreadByServer
      let mentionsByServer = state.mentionsByServer
      if (channelId) {
        for (const [serverId, channels] of Object.entries(state.channelsByServer)) {
          if (channels.includes(channelId)) {
            unreadByServer = { ...state.unreadByServer, [serverId]: 0 }
            mentionsByServer = { ...state.mentionsByServer, [serverId]: 0 }
            break
          }
        }
      }
      return {
        loadingByRoom: { ...state.loadingByRoom, [room]: true },
        activeRoom: room,
        unreadByRoom: { ...state.unreadByRoom, [room]: 0 },
        unreadByServer,
        mentionsByRoom: { ...state.mentionsByRoom, [room]: 0 },
        mentionsByServer
      }
    })
    if (room.startsWith('conversation:')) markReadSoon(room.slice('conversation:'.length))
    try {
      const fetched = await fetch()
      if (useAuthStore.getState().accessToken !== token) return
      if (!openRooms.has(room)) return
      openRooms.set(room, { loaded: true })
      set((state) => ({
        messagesByRoom: {
          ...state.messagesByRoom,
          // Pode já ter mensagem ao vivo que chegou durante o carregamento.
          [room]: mergeMessages(state.messagesByRoom[room] ?? [], fetched)
        },
        hasMoreByRoom: { ...state.hasMoreByRoom, [room]: fetched.length >= MESSAGE_LIMIT }
      }))
    } catch (err) {
      console.error(`[chatStore] openRoom ${room} failed:`, err)
    } finally {
      set((state) => ({
        loadingByRoom: { ...state.loadingByRoom, [room]: false }
      }))
    }
  },

  closeRoom: (room) => {
    openRooms.delete(room)
    client.unsubscribe(room)
    set((state) => {
      const next = { ...state.messagesByRoom }
      delete next[room]
      return {
        messagesByRoom: next,
        activeRoom: state.activeRoom === room ? null : state.activeRoom
      }
    })
  },

  openServer: (serverId) => {
    client.subscribe(`server:${serverId}`)
  },

  closeServer: (serverId) => {
    client.unsubscribe(`server:${serverId}`)
  },

  loadOlder: async (room) => {
    const fetch = getRoomFetch(room)
    const current = get().messagesByRoom[room] ?? []
    if (current.length === 0) return
    // A lista está em ordem (created_at, id): a primeira é a mais antiga.
    const before = current[0].id
    const token = useAuthStore.getState().accessToken
    try {
      const fetched = await fetch(before)
      if (useAuthStore.getState().accessToken !== token) return
      if (fetched.length === 0 || !openRooms.has(room)) return
      set((state) => ({
        messagesByRoom: {
          ...state.messagesByRoom,
          [room]: mergeMessages(state.messagesByRoom[room] ?? [], fetched)
        },
        hasMoreByRoom: { ...state.hasMoreByRoom, [room]: fetched.length >= MESSAGE_LIMIT }
      }))
    } catch (err) {
      console.error(`[chatStore] loadOlder ${room} failed:`, err)
    }
  },

  sendToRoom: async (room, content, attachmentIds = [], replyToId) => {
    const trimmed = content.trim()
    // Mensagem pode ter só anexo, sem texto.
    if (!trimmed && attachmentIds.length === 0) return

    if (room.startsWith('channel:')) {
      await sendChannelMessage(room.slice('channel:'.length), trimmed, attachmentIds, replyToId)
    } else {
      await sendConversationMessage(
        room.slice('conversation:'.length),
        trimmed,
        attachmentIds,
        replyToId
      )
    }

    if (!client.isConnected()) {
      await get().openRoom(room)
    }
    get().fetchConversations()
  },

  deleteFromRoom: async (room, messageId) => {
    if (room.startsWith('channel:')) {
      await deleteChannelMessage(room.slice('channel:'.length), messageId)
    } else {
      await deleteConversationMessage(room.slice('conversation:'.length), messageId)
    }
    set((state) => ({
      messagesByRoom: {
        ...state.messagesByRoom,
        [room]: clearDeletedReplyTarget(state.messagesByRoom[room] ?? [], messageId)
      }
    }))
  },

  editInRoom: async (room, messageId, content) => {
    const updated = await editMessage(room, messageId, content)
    set((state) => withUpdatedMessage(state, room, updated))
  },

  toggleReaction: async (room, messageId, emoji) => {
    const meId = useAuthStore.getState().user?.id
    if (!meId) return

    const messages = get().messagesByRoom[room] ?? []
    const target = messages.find((m) => m.id === messageId)
    const alreadyReacted =
      target?.reactions?.some((r) => r.emoji === emoji && r.user_ids.includes(meId)) ?? false

    set((state) => ({
      messagesByRoom: {
        ...state.messagesByRoom,
        [room]: (state.messagesByRoom[room] ?? []).map((m) =>
          m.id === messageId
            ? {
                ...m,
                reactions: alreadyReacted
                  ? applyReactionRemove(m.reactions, emoji, meId)
                  : applyReactionAdd(m.reactions, emoji, meId)
              }
            : m
        )
      }
    }))

    try {
      if (room.startsWith('channel:')) {
        const channelId = room.slice('channel:'.length)
        if (alreadyReacted) {
          await removeChannelReaction(channelId, messageId, emoji)
        } else {
          await addChannelReaction(channelId, messageId, emoji)
        }
      } else {
        const convId = room.slice('conversation:'.length)
        if (alreadyReacted) {
          await removeConversationReaction(convId, messageId, emoji)
        } else {
          await addConversationReaction(convId, messageId, emoji)
        }
      }
    } catch (err) {
      set((state) => ({
        messagesByRoom: {
          ...state.messagesByRoom,
          [room]: (state.messagesByRoom[room] ?? []).map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  reactions: alreadyReacted
                    ? applyReactionAdd(m.reactions, emoji, meId)
                    : applyReactionRemove(m.reactions, emoji, meId)
                }
              : m
          )
        }
      }))
      throw err
    }
  },

  createPollInRoom: async (room, input) => {
    await createPoll(room, input)
    if (!client.isConnected()) {
      await get().openRoom(room)
    }
    get().fetchConversations()
  },

  votePollInRoom: async (room, messageId, answerIds) => {
    const poll = await votePoll(room, messageId, answerIds)
    set((state) => ({
      messagesByRoom: replacePoll(state.messagesByRoom, room, messageId, () => poll)
    }))
  },

  endPollInRoom: async (room, messageId) => {
    const poll = await endPoll(room, messageId)
    set((state) => ({
      messagesByRoom: replacePoll(state.messagesByRoom, room, messageId, () => poll)
    }))
  },

  fetchConversations: async () => {
    const token = useAuthStore.getState().accessToken
    set({ conversationsLoading: true })
    try {
      const conversations = await listConversations()
      if (useAuthStore.getState().accessToken !== token) return
      // Linha fora do formato (null, sem id, sem membros) não derruba a lista.
      const list = sanitizeConversations(conversations)
      // Não lidas vêm do servidor (sobrevivem ao reload); a aberta fica zerada.
      set((state) => {
        const unreadByRoom = { ...state.unreadByRoom }
        for (const c of list) {
          const room = `conversation:${c.id}`
          unreadByRoom[room] = room === state.activeRoom ? 0 : (c.unread_count ?? 0)
        }
        return { conversations: list, unreadByRoom }
      })
      const meId = useAuthStore.getState().user?.id
      const ids = list
        .flatMap((c) => (c.members ?? []).map((m) => m.id))
        .filter((id) => id !== meId)
      if (ids.length > 0) await get().fetchPresenceFor(ids)
    } catch (err) {
      console.error('[chatStore] fetchConversations error:', err)
    } finally {
      set({ conversationsLoading: false })
    }
  },

  fetchPresenceFor: async (userIds) => {
    const unique = Array.from(new Set(userIds.filter(Boolean)))
    if (unique.length === 0) return
    const token = useAuthStore.getState().accessToken
    try {
      const map: PresenceMap = await fetchPresence(unique)
      if (useAuthStore.getState().accessToken !== token) return
      const presence: Record<string, boolean> = {}
      const statuses: Record<string, PresenceStatus> = {}
      for (const [id, value] of Object.entries(map)) {
        const status = presenceStatusOf(value, value === true)
        statuses[id] = status
        presence[id] = status !== 'offline'
      }
      set((state) => ({
        presence: { ...state.presence, ...presence },
        statuses: { ...state.statuses, ...statuses }
      }))
      // Atividade vem à parte: backend antigo não tem a rota (erro = ignora).
      fetchActivities(unique)
        .then((activities) => {
          if (useAuthStore.getState().accessToken !== token) return
          usePresenceActivityStore.getState().applyFetched(unique, activities)
        })
        .catch(() => {})
    } catch (err) {
      console.error('[chatStore] fetchPresenceFor error:', err)
    }
  },

  fetchChannelsForServers: async (serverIds) => {
    const unique = Array.from(new Set(serverIds.filter(Boolean)))
    if (unique.length === 0) return
    const token = useAuthStore.getState().accessToken
    try {
      const results = await Promise.all(unique.map((id) => listChannels(id)))
      if (useAuthStore.getState().accessToken !== token) return
      const map: Record<string, string[]> = {}
      unique.forEach((id, i) => {
        map[id] = Array.isArray(results[i]) ? results[i].map((c) => c.id) : []
      })
      set((state) => ({ channelsByServer: { ...state.channelsByServer, ...map } }))
    } catch (err) {
      console.error('[chatStore] fetchChannelsForServers error:', err)
    }
  },

  resyncAfterReconnect: async () => {
    const token = useAuthStore.getState().accessToken
    if (!token) return
    // As salas abertas (inclusive uma cuja primeira carga falhou), a ativa primeiro.
    const { activeRoom } = get()
    const rooms = [...openRooms.keys()].sort(
      (a, b) => Number(b === activeRoom) - Number(a === activeRoom)
    )
    const resyncRoom = async (room: RoomKey): Promise<void> => {
      const loaded = openRooms.get(room)?.loaded ?? false
      // O que já se conhecia antes da busca: o que chegar pelo WS enquanto ela
      // roda não entra na conta das não lidas.
      const knownBefore = newestMessage(get().messagesByRoom[room] ?? [])
      try {
        const latest = await getRoomFetch(room)()
        if (useAuthStore.getState().accessToken !== token) return
        const entry = openRooms.get(room)
        if (!entry) return // sala fechada enquanto buscava
        if (!loaded) {
          // A primeira carga tinha falhado: é ela que acontece agora. A página é
          // histórico, não mensagem nova; nada vira não lido.
          entry.loaded = true
          for (const m of latest) notifiedMessages.add(m.id)
          set((state) => ({
            messagesByRoom: {
              ...state.messagesByRoom,
              [room]: mergeMessages(state.messagesByRoom[room] ?? [], latest)
            },
            hasMoreByRoom: { ...state.hasMoreByRoom, [room]: latest.length >= MESSAGE_LIMIT }
          }))
          return
        }
        set((state) => {
          const { messages, added, unseen, reset } = mergeMissedMessages(
            state.messagesByRoom[room] ?? [],
            latest,
            knownBefore
          )
          // Já estão na tela: um evento atrasado da mesma mensagem não notifica.
          for (const m of added) notifiedMessages.add(m.id)
          // Só o que chegou depois da última mensagem conhecida é não lido.
          const unread =
            room !== state.activeRoom && unseen.length > 0
              ? { ...state.unreadByRoom, [room]: (state.unreadByRoom[room] ?? 0) + unseen.length }
              : state.unreadByRoom
          return {
            messagesByRoom: { ...state.messagesByRoom, [room]: messages },
            unreadByRoom: unread,
            hasMoreByRoom: reset
              ? { ...state.hasMoreByRoom, [room]: latest.length >= MESSAGE_LIMIT }
              : state.hasMoreByRoom
          }
        })
      } catch (err) {
        console.error(`[chatStore] resync ${room} failed:`, err)
      }
    }

    const refreshLists = async (): Promise<void> => {
      if (useAuthStore.getState().accessToken !== token) return
      const servers = useServerStore.getState()
      const currentServerId = servers.currentServer?.id
      await Promise.all([
        get().fetchConversations(),
        get().fetchPresenceFor(Object.keys(get().presence)),
        get().fetchChannelsForServers(Object.keys(get().channelsByServer)),
        servers.fetchServers(),
        currentServerId ? servers.fetchChannels(currentServerId) : Promise.resolve(),
        useFriendStore.getState().loadAll(),
        useLevelStore.getState().loadMe()
      ])
    }
    // Presença e listas esperam os outros apps reconectarem também (no deploy
    // todos caem juntos): lida cedo demais, a presença mostraria todo mundo
    // offline por um instante.
    if (listsResyncTimer) clearTimeout(listsResyncTimer)
    listsResyncTimer = setTimeout(() => {
      listsResyncTimer = null
      void refreshLists()
    }, LISTS_RESYNC_DELAY_MS)
    await Promise.all(rooms.map(resyncRoom))
  },

  sendEvent: (type, payload) => {
    client.sendEvent(type, payload)
  },

  subscribeRoom: (room) => {
    client.subscribe(room)
  },

  unsubscribeRoom: (room) => {
    client.unsubscribe(room)
  },

  handleWsEvent: (event) => {
    // Relê o que a pessoa vê do servidor (cargos/canais mudaram) e, se o canal
    // aberto sumiu para ela, sai dele.
    const reconcileAfterPermissionChange = async (serverId: string): Promise<void> => {
      const before = get().channelsByServer[serverId] ?? []
      const servers = useServerStore.getState()
      if (servers.currentServer?.id === serverId) await servers.refreshServer(serverId)
      await get().fetchChannelsForServers([serverId])
      const room = get().activeRoom
      if (!room || !room.startsWith('channel:')) return
      const open = room.slice('channel:'.length)
      const after = get().channelsByServer[serverId] ?? []
      if (before.includes(open) && !after.includes(open)) {
        get().closeRoom(room)
        void router.navigate(`/servers/${serverId}`)
      }
    }

    const payload = event.payload as Record<string, unknown>

    if (event.type === APP_UPDATE_EVENT) {
      requestUpdateCheck()
      return
    }

    if (event.type === 'call:soundboard' || event.type.startsWith('soundboard:')) {
      useSoundboardStore.getState().handleWsEvent(event)
      return
    }

    if (event.type.startsWith('music:')) {
      useMusicStore.getState().handleWsEvent(event)
      return
    }

    if (event.type.startsWith('call:activity')) {
      useActivityStore.getState().handleWsEvent(event)
      return
    }

    if (event.type.startsWith('call:')) {
      useCallStore.getState().handleWsEvent(event)
      return
    }

    if (event.type === 'typing' || event.type === 'typing:stop') {
      useTypingStore.getState().handleWsEvent(event)
      return
    }

    if (event.type.startsWith('level:')) {
      useLevelStore.getState().handleWsEvent(event)
      return
    }

    if (event.type === 'voice:boost') {
      useBoostStore.getState().handleWsEvent(event)
      return
    }

    if (event.type.startsWith('badge:')) {
      useBadgeStore.getState().handleWsEvent(event)
      return
    }

    if (event.type === 'proposal:mention') {
      useProposalStore.getState().handleWsEvent(event)
      const mention = payload as unknown as Parameters<typeof proposalMentionNotification>[0]
      if (mention?.proposal_id) {
        // Marcaram você num comentário de proposta: som + notificação (Não perturbe silencia).
        const me = useAuthStore.getState().user
        const prefs = prefsForStatus(notificationPrefs(), me?.status)
        const notification = proposalMentionNotification(mention)
        notifyDesktop(notification, prefs)
        const sound = notificationSound(notification.kind, prefs)
        if (sound) playSound(sound)
        showToast.info(`${mention.author_name} te marcou na proposta "${mention.proposal_title}"`)
      }
      return
    }

    if (event.type.startsWith('notification-settings:')) {
      useNotifySettingsStore.getState().handleWsEvent(event)
      return
    }

    if (event.type.startsWith('proposal:')) {
      useProposalStore.getState().handleWsEvent(event)
      return
    }

    if (event.type === 'message:create') {
      const msg = payload.message as Message
      const room = msg.channel_id
        ? `channel:${msg.channel_id}`
        : `conversation:${msg.conversation_id}`
      const serverId = (payload.server_id as string) || null
      if (!room.endsWith(':')) {
        useTypingStore.getState().messageArrived(room, msg.author_id)
        // Mensagem de canal: silenciar/nível do servidor e do canal decidem o
        // aviso, a contagem de não lidas e o selo de menção. DM não passa por aqui.
        const meUser = useAuthStore.getState().user
        // O canal "bot" e o que o Maestro escreve nunca avisam nem contam como não lido.
        const quiet =
          msg.author_id === MAESTRO_USER_ID ||
          useServerStore.getState().channels.some(
            (c) => c.id === msg.channel_id && c.is_system && c.name === 'bot'
          )
        const decision = quiet
          ? { notify: false, unread: false, mention: false }
          : meUser && serverId && msg.channel_id
            ? muteDecision(
                useNotifySettingsStore.getState().resolve(serverId, msg.channel_id),
                mentionKindOf(msg, meUser)
              )
            : null
        set((state) => {
          const nextMessages = openRooms.has(room)
            ? {
                ...state.messagesByRoom,
                [room]: mergeMessages(state.messagesByRoom[room] ?? [], [msg])
              }
            : state.messagesByRoom
          const isActive = room === state.activeRoom
          const mine = msg.author_id === useAuthStore.getState().user?.id
          const countUnread = decision?.unread ?? true
          const nextUnread =
            isActive || mine || !countUnread
              ? state.unreadByRoom
              : { ...state.unreadByRoom, [room]: (state.unreadByRoom[room] ?? 0) + 1 }
          const nextServerUnread =
            !isActive && !mine && countUnread && serverId && msg.channel_id
              ? {
                  ...state.unreadByServer,
                  [serverId]: (state.unreadByServer[serverId] ?? 0) + 1
                }
              : state.unreadByServer
          const countMention = !isActive && !mine && !!decision?.mention
          const nextMentions = countMention
            ? { ...state.mentionsByRoom, [room]: (state.mentionsByRoom[room] ?? 0) + 1 }
            : state.mentionsByRoom
          const nextServerMentions =
            countMention && serverId
              ? {
                  ...state.mentionsByServer,
                  [serverId]: (state.mentionsByServer[serverId] ?? 0) + 1
                }
              : state.mentionsByServer
          return {
            messagesByRoom: nextMessages,
            unreadByRoom: nextUnread,
            unreadByServer: nextServerUnread,
            mentionsByRoom: nextMentions,
            mentionsByServer: nextServerMentions
          }
        })

        // DM recebida ou menção a você num canal (inclusive @all/@here liberados
        // pelo backend no mention_everyone): notificação do Windows, aviso
        // na barra de tarefas e som — conforme Configurações → Notificações.
        // Chega mesmo com a conversa fechada (canal pela sala do servidor, DM
        // pela sala user:<eu>) e avisa sempre, menos para quem está lendo
        // essa conversa com a janela em foco (messageAlert).
        // A mesma mensagem chega pela sala do canal e do servidor: avisa uma vez.
        const me = useAuthStore.getState().user
        if (msg.conversation_id && room === get().activeRoom && windowFocused()) {
          markReadSoon(msg.conversation_id, msg.id)
        }
        if (me && !notifiedMessages.has(msg.id) && !isBlocked(msg.author_id)) {
          notifiedMessages.add(msg.id)
          const conv = msg.conversation_id
            ? get().conversations.find((c) => c.id === msg.conversation_id)
            : undefined
          const group =
            conv?.type === 'group' ? { name: conversationTitle(conv, me.id) } : undefined
          const notification =
            messageNotification(msg, me.id, group) ??
            mentionNotification(
              msg,
              { id: me.id, username: me.username, status: me.status },
              serverId,
              serverId ? useServerStore.getState().nicknames?.[serverId] : undefined
            )
          if (notification && (decision?.notify ?? true)) {
            // "Não perturbe" silencia o aviso, a barra de tarefas e o som.
            const prefs = prefsForStatus(notificationPrefs(), me.status)
            const alert = messageAlert(
              notification,
              { focused: windowFocused(), viewingRoom: room === get().activeRoom },
              prefs
            )
            if (alert) {
              deliverDesktop(alert.payload)
              if (alert.sound) playSound(alert.sound)
            }
          }
        }

        if (msg.conversation_id) {
          const existing = get().conversations.find((c) => c.id === msg.conversation_id)
          if (existing) {
            set((state) => {
              const idx = state.conversations.findIndex((c) => c.id === msg.conversation_id)
              if (idx === -1) return {}
              const updated = [...state.conversations]
              updated[idx] = {
                ...updated[idx],
                last_message: {
                  id: msg.id,
                  author_id: msg.author_id,
                  content: messagePreview(msg),
                  created_at: msg.created_at
                }
              }
              const [conv] = updated.splice(idx, 1)
              updated.unshift(conv)
              return { conversations: updated }
            })
          } else {
            void get().fetchConversations()
          }
        }
      }
      return
    }

    if (event.type === 'message:update') {
      const msg = payload.message as Message | undefined
      if (msg?.id) {
        usePinStore.getState().onMessageUpdate(msg)
        const room = msg.channel_id
          ? `channel:${msg.channel_id}`
          : `conversation:${msg.conversation_id}`
        if (!room.endsWith(':')) set((state) => withUpdatedMessage(state, room, msg))
      }
      return
    }

    if (event.type === 'message:delete') {
      const messageId = payload.message_id as string
      if (messageId) {
        usePinStore.getState().onMessageDelete(messageId)
      }
      const channelId = payload.channel_id as string | undefined
      const conversationId = payload.conversation_id as string | undefined
      const serverId = (payload.server_id as string) || null
      const room = channelId ? `channel:${channelId}` : `conversation:${conversationId}`
      set((state) => {
        const currentUnread = state.unreadByRoom[room] ?? 0
        const nextUnread =
          currentUnread > 0
            ? { ...state.unreadByRoom, [room]: currentUnread - 1 }
            : state.unreadByRoom
        const currentServerUnread = serverId ? (state.unreadByServer[serverId] ?? 0) : 0
        const nextServerUnread =
          serverId && channelId && currentServerUnread > 0
            ? { ...state.unreadByServer, [serverId]: currentServerUnread - 1 }
            : state.unreadByServer
        return {
          messagesByRoom: {
            ...state.messagesByRoom,
            [room]: clearDeletedReplyTarget(state.messagesByRoom[room] ?? [], messageId)
          },
          unreadByRoom: nextUnread,
          unreadByServer: nextServerUnread
        }
      })
      return
    }

    if (event.type === 'channel:pin:add') {
      const channelId = payload.channel_id as string
      const pinMsg = payload.message as PinnedMessage | undefined
      if (channelId && pinMsg?.id) {
        usePinStore.getState().onPinAdd(channelId, pinMsg)
        const room = `channel:${channelId}`
        set((state) => ({
          messagesByRoom: {
            ...state.messagesByRoom,
            [room]: (state.messagesByRoom[room] ?? []).map((m) =>
              m.id === pinMsg.id ? { ...m, pinned_at: pinMsg.pinned_at } : m
            )
          }
        }))
      }
      return
    }

    if (event.type === 'channel:pin:remove') {
      const channelId = payload.channel_id as string
      const messageId = payload.message_id as string
      if (channelId && messageId) {
        usePinStore.getState().onPinRemove(channelId, messageId)
        const room = `channel:${channelId}`
        set((state) => ({
          messagesByRoom: {
            ...state.messagesByRoom,
            [room]: (state.messagesByRoom[room] ?? []).map((m) =>
              m.id === messageId ? { ...m, pinned_at: null } : m
            )
          }
        }))
      }
      return
    }

    if (event.type === 'message:reaction:add' || event.type === 'message:reaction:remove') {
      const messageId = payload.message_id as string
      const userId = payload.user_id as string
      const emoji = payload.emoji as string
      const channelId = payload.channel_id as string | undefined
      const conversationId = payload.conversation_id as string | undefined
      const room = channelId ? `channel:${channelId}` : `conversation:${conversationId}`
      if (!room.endsWith(':') && messageId && userId && emoji) {
        const isAdd = event.type === 'message:reaction:add'
        set((state) => ({
          messagesByRoom: {
            ...state.messagesByRoom,
            [room]: (state.messagesByRoom[room] ?? []).map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    reactions: isAdd
                      ? applyReactionAdd(m.reactions, emoji, userId)
                      : applyReactionRemove(m.reactions, emoji, userId)
                  }
                : m
            )
          }
        }))
      }
      return
    }

    if (event.type === 'message:poll:update') {
      const update = payload as unknown as PollUpdate & {
        message_id: string
        channel_id?: string
        conversation_id?: string
      }
      const room = update.channel_id
        ? `channel:${update.channel_id}`
        : `conversation:${update.conversation_id}`
      const meId = useAuthStore.getState().user?.id ?? null
      set((state) => ({
        messagesByRoom: replacePoll(state.messagesByRoom, room, update.message_id, (current) =>
          applyPollUpdate(current, update, meId)
        )
      }))
      return
    }

    if (event.type === 'channel:create') {
      const serverId = payload.server_id as string
      if (serverId) {
        useChannelNameStore.getState().invalidate(serverId)
        useServerStore.getState().fetchChannels(serverId)
        get().fetchChannelsForServers([serverId])
      }
      return
    }

    if (event.type === 'channel:update') {
      const serverId = payload.server_id as string
      if (serverId) {
        useChannelNameStore.getState().invalidate(serverId)
        useServerStore.getState().fetchChannels(serverId)
        get().fetchChannelsForServers([serverId])
      }
      return
    }

    if (event.type === 'channel:reorder') {
      const reorder = payload as {
        server_id?: string
        type?: string
        channel_ids?: string[]
        request_id?: string
      }
      if (
        reorder.server_id &&
        (reorder.type === 'text' || reorder.type === 'voice') &&
        Array.isArray(reorder.channel_ids)
      ) {
        useServerStore
          .getState()
          .receiveChannelOrder(
            reorder.server_id,
            reorder.type,
            reorder.channel_ids,
            reorder.request_id
          )
      }
      return
    }

    if (event.type === 'channel:delete') {
      const serverId = payload.server_id as string
      const channelId = payload.channel_id as string
      if (serverId) useChannelNameStore.getState().invalidate(serverId)
      if (serverId && channelId) {
        const room = `channel:${channelId}`
        set((state) => {
          const messagesByRoom = { ...state.messagesByRoom }
          delete messagesByRoom[room]
          const unreadByRoom = { ...state.unreadByRoom }
          delete unreadByRoom[room]
          const unreadByServer = { ...state.unreadByServer }
          delete unreadByServer[serverId]
          return {
            messagesByRoom,
            unreadByRoom,
            unreadByServer,
            activeRoom: state.activeRoom === room ? null : state.activeRoom
          }
        })
        openRooms.delete(room)
        client.unsubscribe(room)
        useServerStore.getState().fetchChannels(serverId)
        get().fetchChannelsForServers([serverId])
        if (get().activeRoom === null) {
          router.navigate(`/servers/${serverId}`)
        }
      }
      return
    }

    // Cargos, permissões e saída do servidor (sair, expulsão, banimento).
    if (
      handleServerRoleEvent(event, {
        onServerRemoved: (serverId, reason) => {
          const name = useServerStore.getState().servers.find((s) => s.id === serverId)?.name
          get().handleServerDeleted(serverId)
          useServerStore.getState().removeLocalServer(serverId)
          const message = removedMessage(reason, name)
          if (message) showToast.error(message)
        },
        onPermissionsChanged: (serverId) => {
          void reconcileAfterPermissionChange(serverId)
        }
      })
    ) {
      return
    }

    if (event.type === 'server:update') {
      const serverId = payload.server_id as string
      const srv = payload.server as Server | undefined
      // O evento já traz o servidor inteiro: aplica por cima, sem recarregar.
      if (srv) {
        useServerStore.getState().updateLocalServer(srv)
      } else if (serverId && useServerStore.getState().currentServer?.id === serverId) {
        useServerStore
          .getState()
          .selectServer(serverId)
          .catch(() => {})
      }
      return
    }

    if (event.type === 'server:delete') {
      const serverId = payload.server_id as string
      if (serverId) {
        get().handleServerDeleted(serverId)
        useServerStore.getState().removeLocalServer(serverId)
      }
      return
    }

    if (event.type === 'server:member:update') {
      const serverId = payload.server_id as string
      const member = payload.member as ServerMember
      if (serverId && member) useServerStore.getState().updateMember(serverId, member)
      return
    }

    if (event.type === 'server:member:join') {
      const serverId = payload.server_id as string
      const member = payload.member as {
        server_id: string
        user_id: string
        username: string
        display_name: string
        avatar_url?: string
        role: string
        joined_at: string
        updated_at: string
      }
      if (serverId && member) {
        useServerStore.getState().addMember(serverId, member)
      }
      return
    }

    if (event.type === 'server:member:leave') {
      const serverId = payload.server_id as string
      const userId = payload.user_id as string
      if (serverId && userId) {
        useServerStore.getState().removeMember(serverId, userId)
      }
      return
    }

    // Jogo em andamento de alguém (null = parou).
    if (event.type === 'presence:activity') {
      usePresenceActivityStore
        .getState()
        .setActivity(payload.user_id as string, sanitizeActivity(payload.activity))
      return
    }

    if (event.type === 'presence:update') {
      const userId = payload.user_id as string
      const status = presenceStatusOf(payload.status, Boolean(payload.online))
      set((state) => ({
        presence: { ...state.presence, [userId]: status !== 'offline' },
        statuses: { ...state.statuses, [userId]: status }
      }))
      return
    }

    // Alguém mudou nome/foto/banner/bio: atualiza onde a pessoa aparece.
    if (event.type === 'user:update') {
      const profile = payload.user as PublicProfile | undefined
      if (profile?.id) applyUserUpdate(profile)
      return
    }

    const friendUser = payload.user as
      { id: string; username: string; display_name: string } | undefined

    if (event.type === 'friend:request') {
      useFriendStore.getState().loadAll()
      if (friendUser) {
        // Pedido de amizade: som + notificação (Não perturbe silencia).
        const me = useAuthStore.getState().user
        const prefs = prefsForStatus(notificationPrefs(), me?.status)
        const notification = friendRequestNotification(friendUser)
        notifyDesktop(notification, prefs)
        const sound = notificationSound(notification.kind, prefs)
        if (sound) playSound(sound)
        showToast.info(
          `${friendUser.display_name} (@${friendUser.username}) te enviou um pedido de amizade`
        )
      }
      return
    }

    if (event.type === 'friend:request:accepted') {
      useFriendStore.getState().loadAll()
      if (friendUser) {
        showToast.success(`${friendUser.display_name} aceitou seu pedido de amizade`)
      }
      return
    }

    // Recusa, cancelamento, remoção e bloqueio só atualizam as listas (o
    // Discord também não avisa).
    if (
      event.type === 'friend:request:declined' ||
      event.type === 'friend:request:cancelled' ||
      event.type === 'friend:removed' ||
      event.type === 'relationship:blocked' ||
      event.type === 'relationship:unblocked'
    ) {
      useFriendStore.getState().loadAll()
      return
    }

    const conversationId = payload.conversation_id as string | undefined
    if (!conversationId) return

    if (event.type === 'conversation:create' || event.type === 'conversation:update') {
      void get().fetchConversations()
      return
    }

    if (event.type === 'conversation:read') {
      set((state) => ({
        unreadByRoom: { ...state.unreadByRoom, [`conversation:${conversationId}`]: 0 }
      }))
      return
    }

    if (event.type === 'conversation:remove') {
      const room = `conversation:${conversationId}`
      const wasGroup = get().conversations.some(
        (c) => c.id === conversationId && c.type === 'group'
      )
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== conversationId),
        unreadByRoom: { ...state.unreadByRoom, [room]: 0 }
      }))
      // Saiu do grupo (ou foi removido) com ele aberto: volta para Amigos.
      if (wasGroup && get().activeRoom === room) {
        get().closeRoom(room)
        void router.navigate('/friends')
      }
      return
    }
  },

  handleServerDeleted: (serverId) => {
    const channelIds = get().channelsByServer[serverId] ?? []
    const rooms = channelIds.map((cid) => `channel:${cid}`)
    const roomSet = new Set(rooms)
    set((state) => {
      const messagesByRoom = { ...state.messagesByRoom }
      const unreadByRoom = { ...state.unreadByRoom }
      rooms.forEach((room) => {
        delete messagesByRoom[room]
        delete unreadByRoom[room]
      })
      const unreadByServer = { ...state.unreadByServer }
      delete unreadByServer[serverId]
      const channelsByServer = { ...state.channelsByServer }
      delete channelsByServer[serverId]
      return {
        messagesByRoom,
        unreadByRoom,
        unreadByServer,
        channelsByServer,
        activeRoom: state.activeRoom && roomSet.has(state.activeRoom) ? null : state.activeRoom
      }
    })
    rooms.forEach((room) => {
      openRooms.delete(room)
      client.unsubscribe(room)
    })
    if (useServerStore.getState().currentServer?.id === serverId) {
      router.navigate('/friends')
    }
  },

  reset: () => {
    useTypingStore.getState().reset()
    usePresenceActivityStore.getState().reset()
    openRooms.clear()
    set({
      messagesByRoom: {},
      hasMoreByRoom: {},
      loadingByRoom: {},
      unreadByRoom: {},
      unreadByServer: {},
      mentionsByRoom: {},
      mentionsByServer: {},
      channelsByServer: {},
      activeRoom: null,
      presence: {},
      statuses: {},
      conversations: [],
      conversationsLoading: false
    })
  }
}))

/**
 * Perfil novo de alguém (evento user:update): o cache de perfis (que avatar e
 * nome leem em todo lugar), a própria sessão, a lista de membros e de amigos.
 */
function applyUserUpdate(profile: PublicProfile): void {
  useProfileStore.getState().apply(profile)
  const look = {
    display_name: profile.display_name,
    avatar_url: profile.avatar_url ?? null,
    ...(profile.name_style ? { name_style: profile.name_style } : {})
  }

  const auth = useAuthStore.getState()
  if (auth.user?.id === profile.id) {
    // O status da sessão é o escolhido (ex.: invisível), não o efetivo.
    auth.setUser({ ...auth.user, ...profile, status: auth.user.status })
  }

  const servers = useServerStore.getState()
  const serverId = servers.currentServer?.id
  if (serverId && servers.currentMembers.some((m) => m.user_id === profile.id)) {
    const member = servers.currentMembers.find((m) => m.user_id === profile.id)
    if (member) servers.updateMember(serverId, { ...member, ...look })
  }

  const friends = useFriendStore.getState().friends
  if (friends.some((f) => f.id === profile.id)) {
    useFriendStore.setState({
      friends: friends.map((f) => (f.id === profile.id ? { ...f, ...look } : f))
    })
  }
}

/**
 * Status para a bolinha do avatar: o que eu escolhi quando sou eu (invisível
 * inclusive); dos outros, o que chegou pela presença.
 */
export function usePresenceStatus(userId: string | undefined): PresenceStatus {
  const mine = useAuthStore((s) => (userId && s.user?.id === userId ? s.user.status : undefined))
  const known = useChatStore((s) => (userId ? s.statuses[userId] : undefined))
  const online = useChatStore((s) => (userId ? Boolean(s.presence[userId]) : false))
  if (mine) return mine
  if (!online) return 'offline'
  return known && known !== 'offline' ? known : 'online'
}
