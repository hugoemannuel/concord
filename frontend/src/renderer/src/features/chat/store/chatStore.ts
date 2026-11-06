import { create } from 'zustand'
import { useAuthStore } from '../../auth/store/authStore'
import { WsClient, type WsEvent } from '../../../shared/api/ws'
import type { CreatePollInput, Message, ExtraMessageData } from '../api/messages'
import {
  listChannelMessages,
  sendChannelMessage,
  deleteChannelMessage,
  listConversationMessages,
  sendConversationMessage,
  deleteConversationMessage,
  editMessage,
  createPoll,
  votePoll,
  endPoll
} from '../api/messages'
import { hasUserReacted } from '../lib/emotes'
import { withReaction } from '../lib/reactionToggle'
import { sendReaction } from '../api/reactions'
import { mergeMissedMessages, newestMessage } from '../lib/missedMessages'
import { mergeMessages } from '../lib/messageOrder'
import { IDLE_CHAT } from './chatIdle'
import { clearDeletedReplyTarget, replacePoll, withUpdatedMessage } from '../lib/roomMessages'
import { dispatchWsEvent } from './wsEvents/dispatch'
import type { ChatWsContext } from './wsEvents/context'
import { withMessagePage } from '../lib/messagePages'
import { requestUpdateCheck } from '../../updates/lib/appUpdate'
import type { ConversationSummary } from '../api/conversations'
import { listConversations, markConversationRead } from '../api/conversations'
import { sanitizeConversations } from '../lib/conversations'
import type { PresenceMap } from '../../friends/api/presence'
import { fetchActivities, fetchPresence } from '../../friends/api/presence'
import { listChannels } from '../../servers/api/channels'
import { useServerStore } from '../../servers/store/serverStore'
import { useFriendStore } from '../../friends/store/friendStore'
import { useCallStore } from '../../call/store/callStore'
import { useBoostStore } from '../../levels/store/boostStore'
import { useLevelStore } from '../../levels/store/levelStore'
import { useBadgeStore } from '../../levels/store/badgeStore'
import { useProposalStore } from '../../proposals/store/proposalStore'
import { useNotifySettingsStore } from '../../notifications/store/notifySettingsStore'
import { isBotUser } from '../../music/lib/bots'
import { useTypingStore } from './typingStore'
import { usePresenceActivityStore } from '../../activity/store/presenceActivityStore'
import { useListeningStore } from '../../activity/store/listeningStore'
import { useConnectionStore } from '../../../shared/store/connectionStore'
import {
  addPending,
  isRetryableSendError,
  removePending,
  retryableSendErrorText,
  settlePending,
  updatePending,
  type PendingMessage
} from '../lib/pendingMessages'
import { router } from '../../../app/router'
import { MESSAGE_LIMIT } from '../api/messages'
import { presenceStatusOf, type PresenceStatus } from '../../friends/lib/presenceStatus'

export type RoomKey = string

/** Até onde o pulo para uma mensagem antiga volta: 40 páginas (2000 mensagens). */
export const JUMP_MAX_PAGES = 40

export interface ChatState {
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
  /** A lista de conversas já respondeu uma vez: só a primeira carga mostra o skeleton. */
  conversationsLoaded: boolean
  /** Minhas mensagens ainda sem confirmação do servidor ("enviando…" / "não enviada"). */
  pendingByRoom: Record<RoomKey, PendingMessage[]>
  /** Reenvia uma mensagem que falhou. */
  retryPending: (room: RoomKey, localId: string) => Promise<void>
  /** Desiste de uma mensagem que falhou. */
  discardPending: (room: RoomKey, localId: string) => void
  connect: () => void
  disconnect: () => void
  isWsConnected: () => boolean
  /** Botão "Tentar agora" do aviso de conexão. */
  retryWsNow: () => void
  openRoom: (room: RoomKey) => Promise<void>
  closeRoom: (room: RoomKey) => void
  openServer: (serverId: string) => void
  closeServer: (serverId: string) => void
  loadOlder: (room: RoomKey) => Promise<void>
  /**
   * Carrega páginas antigas até a mensagem aparecer na lista (pular para um
   * resultado da busca ou uma resposta antiga). true = está na lista.
   */
  loadOlderUntil: (room: RoomKey, messageId: string, maxPages?: number) => Promise<boolean>
  sendToRoom: (
    room: RoomKey,
    content: string,
    attachmentIds?: string[],
    replyToId?: string | null,
    extra?: ExtraMessageData
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

/** Releitura de presença e listas depois de reconectar (ver resyncAfterReconnect). */
const LISTS_RESYNC_DELAY_MS = 3000
let listsResyncTimer: ReturnType<typeof setTimeout> | null = null

/** O navegador avisa que a rede voltou: tenta o WS na hora, sem esperar o backoff. */
const handleOnline = (): void => {
  useConnectionStore.getState().setOnline(true)
  client.retryNow()
}
const handleOffline = (): void => useConnectionStore.getState().setOnline(false)

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

const client = new WsClient({
  getToken: () => useAuthStore.getState().accessToken,
  getUserId: () => useAuthStore.getState().user?.id ?? null,
  onEvent: (event) => useChatStore.getState().handleWsEvent(event),
  onOpen: (reconnected) => {
    useConnectionStore.getState().wsEvent({ type: 'open' })
    // Avisos de digitando de antes da queda podem nunca receber o stop.
    useTypingStore.getState().reset()
    useCallStore.getState().handleWsReconnect()
    // O servidor perdeu o jogo e a música em andamento na queda: manda de novo.
    usePresenceActivityStore.getState().publishMine()
    useListeningStore.getState().publishMine()
    // Reconexão costuma ser deploy: checa atualização (o aviso app:update é o
    // caminho principal; isto cobre o manifesto publicado antes do reinício).
    requestUpdateCheck()
    if (reconnected) void useChatStore.getState().resyncAfterReconnect()
  },
  onLost: (info) => useConnectionStore.getState().wsEvent({ type: 'lost', ...info })
})

/** Ids locais das mensagens pendentes. */
let pendingSeq = 0
/**
 * Mensagens cuja resposta do POST já chegou (e tirou a pendente): o eco delas
 * pelo WS não pode levar embora outra pendente com o mesmo texto.
 */
const confirmedSends = new Set<string>()

const setPending = (
  room: RoomKey,
  next: (list: PendingMessage[] | undefined) => PendingMessage[]
): void => {
  useChatStore.setState((state) => {
    const current = state.pendingByRoom[room]
    const updated = next(current)
    if (updated === current) return {}
    const pendingByRoom = { ...state.pendingByRoom }
    if (updated.length === 0) delete pendingByRoom[room]
    else pendingByRoom[room] = updated
    return { pendingByRoom }
  })
}

const failPending = (room: RoomKey, localId: string, err: unknown): void =>
  setPending(room, (list) =>
    updatePending(list, localId, {
      status: 'failed',
      error: retryableSendErrorText(err, useConnectionStore.getState().online)
    })
  )

/**
 * Manda a mensagem e já põe a versão do servidor na sala (sem esperar o
 * evento do WS, que pode estar atrasado ou caído).
 */
const postMessage = async (
  room: RoomKey,
  content: string,
  attachmentIds: string[],
  replyToId: string | null,
  extra?: ExtraMessageData
): Promise<void> => {
  const msg = room.startsWith('channel:')
    ? await sendChannelMessage(room.slice('channel:'.length), content, attachmentIds, replyToId, extra)
    : await sendConversationMessage(
        room.slice('conversation:'.length),
        content,
        attachmentIds,
        replyToId,
        extra
      )
  if (msg?.id) {
    confirmedSends.add(msg.id)
    if (confirmedSends.size > 200) confirmedSends.delete(confirmedSends.values().next().value!)
  }
  if (msg?.id && openRooms.has(room)) {
    useChatStore.setState((state) =>
      state.messagesByRoom[room]
        ? {
            messagesByRoom: {
              ...state.messagesByRoom,
              [room]: mergeMessages(state.messagesByRoom[room], [msg])
            }
          }
        : {}
    )
  }
  if (!client.isConnected()) {
    await useChatStore.getState().openRoom(room)
  }
  useChatStore.getState().fetchConversations()
}

/** Mensagens que já geraram notificação (chegam por mais de uma sala). */
const notifiedMessages = new Set<string>()

/** O que os tratadores do WS (wsEvents/) usam do estado de fora do store. */
const wsDeps: Omit<ChatWsContext, 'set' | 'get'> = {
  isRoomOpen: (room) => openRooms.has(room),
  dropRoom: (room) => {
    openRooms.delete(room)
    client.unsubscribe(room)
  },
  settleEcho: (room, msg) => {
    // Chegou a minha mensagem que ainda aparecia como pendente: o servidor gravou.
    if (confirmedSends.has(msg.id)) return
    setPending(room, (list) => settlePending(list, msg, useAuthStore.getState().user?.id))
  },
  claimNotification: (messageId) => {
    if (notifiedMessages.has(messageId)) return false
    notifiedMessages.add(messageId)
    return true
  },
  markReadSoon
}

export const useChatStore = create<ChatState>()((set, get) => ({
  ...IDLE_CHAT,

  connect: () => {
    useConnectionStore.getState().wsEvent({ type: 'connect' })
    useConnectionStore.getState().setOnline(navigator.onLine !== false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    client.connect()
    get().fetchConversations()
    void useLevelStore.getState().loadMe()
    void useNotifySettingsStore.getState().fetchSettings()
  },
  disconnect: () => {
    client.disconnect()
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    useConnectionStore.getState().wsEvent({ type: 'stop' })
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
  retryWsNow: () => client.retryNow(),

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
      set((state) => withMessagePage(state, room, fetched))
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
      if (!openRooms.has(room)) return
      // Página vazia também encerra o histórico (total múltiplo da página),
      // senão o scroll infinito deixaria o topo "carregando" para sempre.
      set((state) => withMessagePage(state, room, fetched))
    } catch (err) {
      console.error(`[chatStore] loadOlder ${room} failed:`, err)
    }
  },

loadOlderUntil: async (room, messageId, maxPages = JUMP_MAX_PAGES) => {
    const has = (): boolean => (get().messagesByRoom[room] ?? []).some((m) => m.id === messageId)
    for (let i = 0; i < maxPages && !has(); i++) {
      if (!openRooms.has(room) || !(get().hasMoreByRoom[room] ?? false)) break
      const oldest = get().messagesByRoom[room]?.[0]?.id
      await get().loadOlder(room)
      // Nada novo (erro ou fim): não adianta insistir.
      if (get().messagesByRoom[room]?.[0]?.id === oldest) break
    }
    return has()
  },

  sendToRoom: async (room, content, attachmentIds = [], replyToId, extra) => {
    const trimmed = content.trim()
    // Mensagem pode ter só anexo, sem texto.
    const hasMedia = attachmentIds.length > 0 || Boolean(extra?.stickerId) || Boolean(extra?.gifUrl)
    if (!trimmed && !hasMedia) return

    // Só texto vira bolha "enviando…" (com anexo, os arquivos continuam no
    // campo e o ChatPane cuida da falha).
    const localId =
      attachmentIds.length === 0 && !extra?.stickerId && !extra?.gifUrl ? `local-${++pendingSeq}` : null
    if (localId) {
      setPending(room, (list) =>
        addPending(list, {
          localId,
          content: trimmed,
          replyToId: replyToId ?? null,
          status: 'sending',
          error: null
        })
      )
    }
    try {
      await postMessage(room, trimmed, attachmentIds, replyToId ?? null, extra)
    } catch (err) {
      if (localId && isRetryableSendError(err)) {
        // Fica na tela como "Não enviada — tentar de novo".
        failPending(room, localId, err)
        return
      }
      if (localId) setPending(room, (list) => removePending(list, localId))
      throw err
    }
    if (localId) setPending(room, (list) => removePending(list, localId))
  },

  retryPending: async (room, localId) => {
    const item = get().pendingByRoom[room]?.find((p) => p.localId === localId)
    if (!item || item.status === 'sending') return
    setPending(room, (list) => updatePending(list, localId, { status: 'sending', error: null }))
    try {
      await postMessage(room, item.content, [], item.replyToId)
    } catch (err) {
      if (isRetryableSendError(err)) {
        failPending(room, localId, err)
        return
      }
      const message =
        (err as { status?: unknown } | null)?.status === 403
          ? 'Você não pode mais enviar mensagens aqui.'
          : 'O servidor recusou a mensagem.'
      setPending(room, (list) => updatePending(list, localId, { status: 'failed', error: message }))
      return
    }
    setPending(room, (list) => removePending(list, localId))
  },

  discardPending: (room, localId) => setPending(room, (list) => removePending(list, localId)),

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
    const target = (get().messagesByRoom[room] ?? []).find((m) => m.id === messageId)
    const add = !hasUserReacted(target?.reactions, emoji, meId)
    const apply = (adding: boolean): void =>
      set((state) => ({
        messagesByRoom: withReaction(state.messagesByRoom, room, messageId, emoji, meId, adding)
      }))

    apply(add)
    try {
      await sendReaction(room, messageId, emoji, add)
    } catch (err) {
      apply(!add)
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
        return { conversations: list, unreadByRoom, conversationsLoaded: true }
      })
      const meId = useAuthStore.getState().user?.id
      const ids = list
        .flatMap((c) => (c.members ?? []).map((m) => m.id))
        .filter((id) => id !== meId)
      if (ids.length > 0) await get().fetchPresenceFor(ids)
    } catch (err) {
      console.error('[chatStore] fetchConversations error:', err)
      if (useAuthStore.getState().accessToken === token) set({ conversationsLoaded: true })
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
          set((state) => withMessagePage(state, room, latest))
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

  handleWsEvent: (event) => dispatchWsEvent(event, { set, get, ...wsDeps }),

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
    set(IDLE_CHAT)
  }
}))

/**
 * Status para a bolinha do avatar: o que eu escolhi quando sou eu (invisível
 * inclusive); dos outros, o que chegou pela presença.
 */
export function usePresenceStatus(userId: string | undefined): PresenceStatus {
  const mine = useAuthStore((s) => (userId && s.user?.id === userId ? s.user.status : undefined))
  const known = useChatStore((s) => (userId ? s.statuses[userId] : undefined))
  const online = useChatStore((s) => (userId ? Boolean(s.presence[userId]) : false))
  if (mine) return mine
  // Bots não têm websocket: sempre online (como no cartão de perfil).
  if (isBotUser(userId)) return 'online'
  if (!online) return 'offline'
  return known && known !== 'offline' ? known : 'online'
}
