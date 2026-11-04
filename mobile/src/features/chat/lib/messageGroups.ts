import type { Message } from '../api/messages'

/** Mensagens da mesma pessoa a menos de 5 min uma da outra formam um bloco. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000

export interface GroupedMessage {
  message: Message
  /** Mostra avatar, nome e hora (primeira do bloco). */
  showHeader: boolean
  /** Dia (AAAA-MM-DD) quando a mensagem abre um dia novo: a tela desenha o separador. */
  dayLabel: string | null
}

/** Dia civil (AAAA-MM-DD) da data ISO, no fuso do aparelho (ou no pedido). */
export function dayKey(iso: string, timeZone?: string): string {
  const date = new Date(iso)
  if (timeZone) return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Recebe e devolve da mais nova para a mais antiga; o "anterior" é o próximo item. */
export function groupMessages(messages: Message[], timeZone?: string): GroupedMessage[] {
  return messages.map((message, i) => {
    const older = messages[i + 1]
    const day = dayKey(message.created_at, timeZone)
    const newDay = !older || dayKey(older.created_at, timeZone) !== day
    const sameBlock =
      !!older &&
      !newDay &&
      older.author_id === message.author_id &&
      Date.parse(message.created_at) - Date.parse(older.created_at) <= GROUP_WINDOW_MS
    return { message, showHeader: !sameBlock, dayLabel: newDay ? day : null }
  })
}
