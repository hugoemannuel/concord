// message:create: a mensagem entra na sala aberta, conta como não lida/menção,
// avisa (DM ou menção) e sobe a DM na lista de conversas.
import type { Message } from '../../api/messages'
import type { ConversationSummary } from '../../api/conversations'
import type { ChatState, RoomKey } from '../chatStore'
import { roomKeyOf, type ChatWsContext, type Payload } from './context'
import { mergeMessages } from '../../lib/messageOrder'
import { messagePreview } from '../../lib/polls'
import { conversationTitle } from '../../lib/conversations'
import { useTypingStore } from '../typingStore'
import { useAuthStore } from '../../../auth/store/authStore'
import { useServerStore } from '../../../servers/store/serverStore'
import { useFriendStore } from '../../../friends/store/friendStore'
import { useNotifySettingsStore } from '../../../notifications/store/notifySettingsStore'
import { myRoleIdsIn } from '../../../servers/store/myRolesStore'
import {
  mentionKindOf,
  muteDecision,
  type MuteDecision
} from '../../../notifications/lib/notificationMute'
import {
  deliverDesktop,
  mentionNotification,
  messageAlert,
  messageNotification,
  type AppNotification
} from '../../../notifications/lib/notifications'
import { notificationPrefs } from '../../../notifications/store/notificationPrefsStore'
import { prefsForStatus, type ChosenStatus } from '../../../friends/lib/presenceStatus'
import { playSound } from '../../../call/lib/sounds'
import { isMaestroQuiet } from '../../../music/lib/music'

/** Uma mensagem que chegou, já com a sala e a decisão de silenciar. */
export interface Arrival {
  msg: Message
  room: RoomKey
  serverId: string | null
  /** null = sem regra de silenciar (DM): avisa e conta como sempre. */
  decision: MuteDecision | null
}

type Counts = Pick<
  ChatState,
  'unreadByRoom' | 'unreadByServer' | 'mentionsByRoom' | 'mentionsByServer'
>

const SILENT: MuteDecision = { notify: false, unread: false, mention: false }

/** A janela (ou a aba, no web) está à vista e com foco. */
const windowFocused = (): boolean => document.visibilityState !== 'hidden' && document.hasFocus()

const isBlocked = (userId: string): boolean =>
  useFriendStore.getState().blocked.some((u) => u.id === userId)

const bump = (map: Record<string, number>, key: string): Record<string, number> => ({
  ...map,
  [key]: (map[key] ?? 0) + 1
})

/**
 * Mensagem de canal: silenciar/nível do servidor e do canal decidem o aviso,
 * a contagem de não lidas e o selo de menção. DM não passa por aqui. O canal
 * #musica e o que o Maestro escreve nunca avisam nem contam como não lido.
 */
export function arrivalDecision(msg: Message, serverId: string | null): MuteDecision | null {
  if (isMaestroQuiet(msg, useServerStore.getState().channels)) return SILENT
  const me = useAuthStore.getState().user
  if (!me || !serverId || !msg.channel_id) return null
  return muteDecision(
    useNotifySettingsStore.getState().resolve(serverId, msg.channel_id),
    mentionKindOf(msg, me, myRoleIdsIn(serverId))
  )
}

function unreadCounts(state: Counts, a: Arrival, fresh: boolean): Partial<Counts> {
  const unread = fresh && (a.decision?.unread ?? true)
  return {
    unreadByRoom: unread ? bump(state.unreadByRoom, a.room) : state.unreadByRoom,
    unreadByServer:
      unread && a.serverId && a.msg.channel_id
        ? bump(state.unreadByServer, a.serverId)
        : state.unreadByServer
  }
}

function mentionCounts(state: Counts, a: Arrival, fresh: boolean): Partial<Counts> {
  const mention = fresh && !!a.decision?.mention
  return {
    mentionsByRoom: mention ? bump(state.mentionsByRoom, a.room) : state.mentionsByRoom,
    mentionsByServer:
      mention && a.serverId ? bump(state.mentionsByServer, a.serverId) : state.mentionsByServer
  }
}

/**
 * A mensagem entra na lista (só se a sala está aberta) e soma em não lidas e
 * menções, menos na sala que a pessoa está vendo e nas mensagens dela.
 */
export function withArrivedMessage(
  state: ChatState,
  a: Arrival,
  opts: { open: boolean; meId: string | undefined }
): Partial<ChatState> {
  const fresh = a.room !== state.activeRoom && a.msg.author_id !== opts.meId
  const messagesByRoom = opts.open
    ? {
        ...state.messagesByRoom,
        [a.room]: mergeMessages(state.messagesByRoom[a.room] ?? [], [a.msg])
      }
    : state.messagesByRoom
  return { messagesByRoom, ...unreadCounts(state, a, fresh), ...mentionCounts(state, a, fresh) }
}

/** A DM vai para o topo da lista com a prévia da mensagem nova. */
export function withConversationOnTop(
  conversations: ConversationSummary[],
  msg: Message
): Partial<ChatState> {
  const idx = conversations.findIndex((c) => c.id === msg.conversation_id)
  if (idx === -1) return {}
  const updated = [...conversations]
  const [conv] = updated.splice(idx, 1)
  updated.unshift({
    ...conv,
    last_message: {
      id: msg.id,
      author_id: msg.author_id,
      content: messagePreview(msg),
      created_at: msg.created_at
    }
  })
  return { conversations: updated }
}

/** O aviso da mensagem: DM (com o nome do grupo) ou menção num canal. */
function arrivalNotification(
  a: Arrival,
  me: { id: string; username: string; status?: ChosenStatus },
  conversations: ConversationSummary[]
): AppNotification | null {
  const conv = a.msg.conversation_id
    ? conversations.find((c) => c.id === a.msg.conversation_id)
    : undefined
  const group = conv?.type === 'group' ? { name: conversationTitle(conv, me.id) } : undefined
  return (
    messageNotification(a.msg, me.id, group) ??
    mentionNotification(
      a.msg,
      { id: me.id, username: me.username, status: me.status, roleIds: myRoleIdsIn(a.serverId) },
      a.serverId,
      a.serverId ? useServerStore.getState().nicknames?.[a.serverId] : undefined
    )
  )
}

/** Notificação do sistema, barra de tarefas e som ("Não perturbe" silencia tudo). */
function deliverAlert(
  notification: AppNotification,
  status: ChosenStatus | undefined,
  viewingRoom: boolean
): void {
  const prefs = prefsForStatus(notificationPrefs(), status)
  const alert = messageAlert(notification, { focused: windowFocused(), viewingRoom }, prefs)
  if (!alert) return
  deliverDesktop(alert.payload)
  if (alert.sound) playSound(alert.sound)
}

/**
 * DM recebida ou menção a você num canal (inclusive @all/@here liberados pelo
 * backend no mention_everyone): notificação do sistema, aviso na barra de
 * tarefas e som, conforme Configurações → Notificações. Chega mesmo com a
 * conversa fechada (canal pela sala do servidor, DM pela sala user:<eu>) e
 * avisa sempre, menos para quem está lendo essa conversa com a janela em foco
 * (messageAlert). A mesma mensagem chega pela sala do canal e do servidor:
 * avisa uma vez.
 */
function notifyArrival(a: Arrival, ctx: ChatWsContext): void {
  const me = useAuthStore.getState().user
  if (!me || isBlocked(a.msg.author_id) || !ctx.claimNotification(a.msg.id)) return
  const notification = arrivalNotification(a, me, ctx.get().conversations)
  if (!notification || !(a.decision?.notify ?? true)) return
  deliverAlert(notification, me.status, a.room === ctx.get().activeRoom)
}

/** A DM sobe na lista; conversa que ainda não está nela faz reler a lista. */
function bumpConversation(msg: Message, ctx: ChatWsContext): void {
  if (!msg.conversation_id) return
  if (!ctx.get().conversations.some((c) => c.id === msg.conversation_id)) {
    void ctx.get().fetchConversations()
    return
  }
  ctx.set((state) => withConversationOnTop(state.conversations, msg))
}

/** Lendo a DM com a janela em foco: já marca como lida. */
function markReadIfViewing(a: Arrival, ctx: ChatWsContext): void {
  const id = a.msg.conversation_id
  if (id && a.room === ctx.get().activeRoom && windowFocused()) ctx.markReadSoon(id, a.msg.id)
}

export function handleMessageCreate(payload: Payload, ctx: ChatWsContext): void {
  const msg = payload.message as Message
  const room = roomKeyOf(msg.channel_id, msg.conversation_id)
  if (room.endsWith(':')) return
  const serverId = (payload.server_id as string) || null
  useTypingStore.getState().messageArrived(room, msg.author_id)
  const arrival: Arrival = { msg, room, serverId, decision: arrivalDecision(msg, serverId) }
  ctx.settleEcho(room, msg)
  const meId = useAuthStore.getState().user?.id
  ctx.set((state) => withArrivedMessage(state, arrival, { open: ctx.isRoomOpen(room), meId }))
  markReadIfViewing(arrival, ctx)
  notifyArrival(arrival, ctx)
  bumpConversation(msg, ctx)
}
