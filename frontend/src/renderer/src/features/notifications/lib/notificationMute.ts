import type { Message } from '../../chat/api/messages'
import { everyonePingsMe, textMentionsUser } from '../../chat/lib/mentions'
import type { ChosenStatus } from '../../friends/lib/presenceStatus'

export type NotificationLevel = 'all' | 'mentions' | 'nothing'

/** Preferência de mute de um servidor ou canal (espelha o backend). */
export interface NotifySettings {
  muted: boolean
  /** ISO. Nulo com muted = até reativar. */
  muted_until: string | null
  level: NotificationLevel
  suppress_everyone: boolean
}

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  muted: false,
  muted_until: null,
  level: 'all',
  suppress_everyone: false
}

/** Durações do menu "Silenciar" (null = até eu reativar). */
export const MUTE_DURATIONS: { label: string; ms: number | null }[] = [
  { label: 'Por 15 minutos', ms: 15 * 60_000 },
  { label: 'Por 1 hora', ms: 60 * 60_000 },
  { label: 'Por 8 horas', ms: 8 * 60 * 60_000 },
  { label: 'Por 24 horas', ms: 24 * 60 * 60_000 },
  { label: 'Até eu reativar', ms: null }
]

/** ISO do fim de um mute de `ms` a partir de agora (null = até reativar). */
export function muteUntil(ms: number | null, now: number = Date.now()): string | null {
  return ms === null ? null : new Date(now + ms).toISOString()
}

/** Silenciado agora? Prazo vencido conta como reativado, sem precisar de job. */
export function isMutedNow(s: NotifySettings | undefined, now: number): boolean {
  if (!s?.muted) return false
  if (!s.muted_until) return true
  return Date.parse(s.muted_until) > now
}

/** O mute (ou o nível) está valendo? Usado para esmaecer e listar. */
export function isActive(s: NotifySettings | undefined, now: number): boolean {
  if (!s) return false
  return isMutedNow(s, now) || s.level !== 'all' || s.suppress_everyone
}

export interface ResolvedScope {
  muted: boolean
  level: NotificationLevel
  suppressEveryone: boolean
}

/**
 * Junta servidor e canal. Silenciar vale se um dos dois está silenciado. O
 * nível do canal manda quando não é "all"; "all" no canal herda o do servidor.
 */
export function resolveScope(
  server: NotifySettings | undefined,
  channel: NotifySettings | undefined,
  now: number
): ResolvedScope {
  const channelLevel = channel?.level ?? 'all'
  return {
    muted: isMutedNow(server, now) || isMutedNow(channel, now),
    level: channelLevel !== 'all' ? channelLevel : (server?.level ?? 'all'),
    suppressEveryone: server?.suppress_everyone ?? false
  }
}

export interface MentionKind {
  /** @nick ou resposta a uma mensagem sua. */
  direct: boolean
  /** @all/@here que vale para mim. */
  everyone: boolean
}

/** Como a mensagem de canal me alcança (a lógica de mentionNotification, sem o texto). */
export function mentionKindOf(
  message: Message,
  me: { id: string; username: string; status?: ChosenStatus }
): MentionKind {
  if (message.author_id === me.id) return { direct: false, everyone: false }
  return {
    direct:
      message.reply_to?.author_id === me.id || textMentionsUser(message, me.username),
    everyone: everyonePingsMe(message.mention_everyone, me.status)
  }
}

export interface MuteDecision {
  /** Aviso do Windows, som e selo da barra de tarefas. */
  notify: boolean
  /** Soma na contagem de não lidas do canal/servidor. */
  unread: boolean
  /** Soma na contagem de menções (selo vermelho). */
  mention: boolean
}

/**
 * O que uma mensagem de canal gera, dada a preferência. Silenciar apaga o
 * aviso e a bolinha de não lida, mas a menção ainda aparece como selo. "Nada"
 * não deixa nem isso.
 */
export function muteDecision(scope: ResolvedScope, kind: MentionKind): MuteDecision {
  const mention = kind.direct || (kind.everyone && !scope.suppressEveryone)
  if (scope.level === 'nothing') return { notify: false, unread: false, mention: false }
  if (scope.muted) return { notify: false, unread: false, mention }
  if (scope.level === 'mentions') return { notify: mention, unread: false, mention }
  return { notify: mention, unread: true, mention }
}
