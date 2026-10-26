import type { Message } from '../api/messages'
import { everyonePingsMe, mentionsUser } from './mentions'
import { messagePreview } from './polls'
import type { ChosenStatus } from './presenceStatus'
import { serverDisplayName } from './serverNames'
import type { SoundName } from './sounds'

/** De onde veio o aviso: decide o som e o que as preferências controlam. */
export type NotificationKind = 'message' | 'mention' | 'call' | 'friend_request'

/** Preferências de notificação do usuário (Configurações → Notificações). */
export interface NotificationPrefs {
  /** Toast nativo do Windows. */
  desktop: boolean
  /** Piscar o botão e mostrar o selo de não lidas na barra de tarefas. */
  taskbar: boolean
  /** Som ao receber DM ou menção. */
  sound: boolean
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  desktop: true,
  taskbar: true,
  sound: true
}

export interface AppNotification {
  kind: NotificationKind
  title: string
  body: string
  /** Rota aberta ao clicar na notificação. */
  route: string
  /** Pisca a janela na barra de tarefas (chamada recebida). */
  urgent?: boolean
}

const MAX_BODY = 140

function truncate(text: string): string {
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text
}

/**
 * Notificação para uma DM recebida (mensagens de canal não notificam). Em DM
 * em grupo, o título leva o nome do grupo e o clique abre o grupo.
 */
export function messageNotification(
  message: Message,
  meId: string,
  group?: { name: string }
): AppNotification | null {
  if (!message.conversation_id || message.author_id === meId) return null
  const author = message.author?.display_name || message.author?.username || 'Nova mensagem'
  return {
    kind: 'message',
    title: group ? `${author} em ${group.name}` : author,
    body: truncate(messagePreview(message)),
    route: group ? `/dm/c/${message.conversation_id}` : `/dm/${message.author_id}`
  }
}

/** Pedido de amizade recebido: abre a aba Pendentes. */
export function friendRequestNotification(requester: {
  display_name: string
  username: string
}): AppNotification {
  return {
    kind: 'friend_request',
    title: 'Pedido de amizade',
    body: `${requester.display_name || requester.username} quer ser seu amigo`,
    route: '/friends?tab=pending'
  }
}

/** Marcaram você num comentário de proposta: abre a proposta no quadro. */
export function proposalMentionNotification(mention: {
  proposal_id: string
  proposal_title: string
  author_name: string
  snippet: string
}): AppNotification {
  return {
    kind: 'mention',
    title: `${mention.author_name} te marcou em "${mention.proposal_title}"`,
    body: truncate(mention.snippet),
    route: `/proposals?proposal=${mention.proposal_id}`
  }
}

/**
 * Notificação para uma mensagem de canal que menciona você (@nick), responde
 * sua mensagem ou pinga o canal (@all/@here, pelo mention_everyone que o
 * backend liberou). `status` é o escolhido por você: @here não pinga ausente.
 * `nicknames`: apelidos do servidor (o autor aparece pelo apelido).
 */
export function mentionNotification(
  message: Message,
  me: { id: string; username: string; status?: ChosenStatus },
  serverId: string | null,
  nicknames?: Record<string, string>
): AppNotification | null {
  if (!message.channel_id || !serverId || message.author_id === me.id) return null
  const isReplyToMe = message.reply_to?.author_id === me.id
  const isMention = mentionsUser(message.content, me.username)
  const everyone = everyonePingsMe(message.mention_everyone, me.status)
    ? message.mention_everyone
    : null
  if (!isMention && !isReplyToMe && !everyone) return null
  const author = serverDisplayName(
    { nickname: nicknames?.[message.author_id] },
    message.author,
    'Alguém'
  )
  return {
    kind: 'mention',
    // Aviso do próprio servidor (ex.: aniversário/boas-vindas) não é "Fulano mencionou você".
    title:
      message.system_kind === 'birthday'
        ? '🎂 Feliz aniversário!'
        : message.system_kind === 'welcome'
          ? '👋 Boas-vindas!'
          : isMention
            ? `${author} mencionou você`
            : isReplyToMe
              ? `${author} respondeu você`
              : `${author} mencionou @${everyone}`,
    body: truncate(messagePreview(message)),
    route: `/servers/${serverId}/channels/${message.channel_id}`
  }
}

export function callNotification(caller: {
  id: string
  display_name: string
  username: string
}): AppNotification {
  return {
    kind: 'call',
    title: `${caller.display_name || caller.username} está te ligando`,
    body: 'Chamada de voz — clique para atender',
    route: `/dm/${caller.id}`,
    urgent: true
  }
}

/** Alguém pediu para entrar na sala trancada em que estou (som próprio no callStore). */
export function knockNotification(
  requester: { display_name: string; username: string },
  serverId: string | null,
  channelId: string | null
): AppNotification {
  return {
    kind: 'call',
    title: `${requester.display_name || requester.username} quer entrar na sala`,
    body: 'A sala está trancada — clique para aceitar ou recusar',
    route: serverId && channelId ? `/servers/${serverId}/channels/${channelId}` : '/'
  }
}

/** Som do aviso (null = sem som). Chamada tem toque próprio no callStore. */
export function notificationSound(
  kind: NotificationKind,
  prefs: Pick<NotificationPrefs, 'sound'>
): SoundName | null {
  if (!prefs.sound || kind === 'call') return null
  return kind === 'mention' ? 'mention' : 'message'
}

export interface DesktopPayload {
  title: string
  body: string
  route: string
  urgent?: boolean
  toast: boolean
  taskbar: boolean
  /**
   * A conversa do aviso não está na tela: o toast aparece mesmo com a janela
   * em foco (a pessoa está no app, mas em outro chat ou na tela de amigos).
   */
  elsewhere?: boolean
}

/**
 * O que vai para o processo main. Chamada recebida ignora as preferências:
 * sempre mostra o toast e pisca a barra de tarefas, como antes.
 */
export function desktopPayload(
  notification: AppNotification,
  prefs: NotificationPrefs,
  { elsewhere = false }: { elsewhere?: boolean } = {}
): DesktopPayload {
  const { title, body, route, urgent } = notification
  return {
    title,
    body,
    route,
    ...(urgent ? { urgent } : {}),
    toast: urgent ? true : prefs.desktop,
    taskbar: urgent ? true : prefs.taskbar,
    ...(elsewhere ? { elsewhere } : {})
  }
}

/** Onde a pessoa está quando chega uma DM ou menção. */
export interface ViewState {
  /** A janela (ou a aba, no web) está visível e com foco. */
  focused: boolean
  /** A conversa da mensagem é a que está aberta na tela. */
  viewingRoom: boolean
}

export interface MessageAlert {
  /** Aviso para o processo main (ou para o aviso do navegador). */
  payload: DesktopPayload
  /** Som a tocar agora (null = em silêncio). */
  sound: SoundName | null
}

/**
 * O que fazer com uma DM ou menção que chegou. Nada se a pessoa está lendo
 * essa conversa (janela em foco e conversa aberta), nem se as preferências
 * (ou o "Não perturbe", já aplicado em prefs) desligaram tudo. Em qualquer
 * outro caso avisa: janela sem foco ou em outro chat. Em outro chat com a
 * janela em foco o payload vai com `elsewhere`, para o toast aparecer.
 */
export function messageAlert(
  notification: AppNotification | null,
  view: ViewState,
  prefs: NotificationPrefs
): MessageAlert | null {
  if (!notification) return null
  if (view.focused && view.viewingRoom) return null
  const payload = desktopPayload(notification, prefs, { elsewhere: !view.viewingRoom })
  const sound = notificationSound(notification.kind, prefs)
  if (!payload.toast && !payload.taskbar && !sound) return null
  return { payload, sound }
}

type DesktopNotifier = (payload: DesktopPayload) => void

/** No navegador quem mostra o aviso é o WebNotificationBridge. */
let webNotifier: DesktopNotifier | null = null

/** Liga (ou desliga, com null) o aviso do build web. */
export function setWebNotifier(notifier: DesktopNotifier | null): void {
  webNotifier = notifier
}

/**
 * Pede ao processo main uma notificação nativa. Fora do Electron, vai para o
 * aviso do navegador, se o build web ligou um (senão é no-op).
 */
export function notifyDesktop(
  notification: AppNotification,
  prefs: NotificationPrefs = DEFAULT_NOTIFICATION_PREFS
): void {
  deliverDesktop(desktopPayload(notification, prefs))
}

/** Entrega um payload pronto (ver messageAlert) ao processo main ou ao navegador. */
export function deliverDesktop(payload: DesktopPayload): void {
  if (typeof window === 'undefined') return
  const background = window.api?.background
  if (background) background.notify(payload)
  else webNotifier?.(payload)
}
