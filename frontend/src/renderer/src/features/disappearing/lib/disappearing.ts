import type { Message } from '../../chat/api/messages'

/** Prazos válidos das mensagens temporárias: 24 h, 7 dias, 90 dias (null = desativado). */
export type DisappearingSeconds = 86400 | 604800 | 7776000

/** As quatro opções do menu, na ordem; `seconds: null` desativa. */
export const DISAPPEARING_OPTIONS: readonly {
  seconds: DisappearingSeconds | null
  label: string
}[] = [
  { seconds: null, label: 'Desativadas' },
  { seconds: 86400, label: '24 horas' },
  { seconds: 604800, label: '7 dias' },
  { seconds: 7776000, label: '90 dias' }
]

const SHORT: Record<DisappearingSeconds, '24 h' | '7 d' | '90 d'> = {
  86400: '24 h',
  604800: '7 d',
  7776000: '90 d'
}

const LONG: Record<DisappearingSeconds, string> = {
  86400: '24 horas',
  604800: '7 dias',
  7776000: '90 dias'
}

/** Rótulo curto do botão quando o modo está ligado. */
export function shortLabel(seconds: DisappearingSeconds): '24 h' | '7 d' | '90 d' {
  return SHORT[seconds]
}

/** Texto da faixa acima do campo de mensagem. */
export function bannerText(seconds: DisappearingSeconds): string {
  return `Mensagens temporárias ativadas: ${LONG[seconds]}`
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

/** Dica do relógio da mensagem: "Some em 3 dias" (arredonda para cima). */
export function expiresInText(expiresAt: string, now: number): string {
  const ms = Math.max(0, new Date(expiresAt).getTime() - now)
  // A unidade sai do valor já arredondado: 59m30s é "1 hora", não "60 minutos".
  const minutes = Math.max(1, Math.ceil(ms / MINUTE))
  if (minutes < 60) return `Some em ${plural(minutes, 'minuto', 'minutos')}`
  const hours = Math.ceil(ms / HOUR)
  if (hours < 24) return `Some em ${plural(hours, 'hora', 'horas')}`
  return `Some em ${plural(Math.ceil(ms / DAY), 'dia', 'dias')}`
}

/** O prazo já chegou (igual a `now` conta como vencida)? */
export function isExpired(m: Pick<Message, 'expires_at'>, now: number): boolean {
  return m.expires_at != null && new Date(m.expires_at).getTime() <= now
}

/** Id da conversa de uma sala `conversation:<id>`; canal e outras salas dão null. */
export function conversationIdOfRoom(room: string): string | null {
  return room.startsWith('conversation:') ? room.slice('conversation:'.length) : null
}
