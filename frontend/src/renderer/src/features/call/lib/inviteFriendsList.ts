import type { InviteResult, InviteResultStatus } from '../api/callInvites'
import { INVITE_COPY, resultText } from './callInviteCopy'

export interface InvitableFriend {
  id: string
  username: string
  display_name: string
  avatar_url?: string | null
  avatar_decoration_url?: string | null
}

const norm = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Amigos que a lista oferece: tira quem já está na call, filtra pela busca
 * (nome ou @usuário, sem acento) e põe os online primeiro. O servidor valida
 * tudo de novo; isto é só para a tela não oferecer o que sabe que não vale.
 */
export function invitableFriends(
  friends: InvitableFriend[],
  inCallIds: string[],
  query: string,
  isOnline: (id: string) => boolean
): InvitableFriend[] {
  const skip = new Set(inCallIds)
  const q = norm(query)
  const label = (f: InvitableFriend): string => f.display_name || f.username
  return friends
    .filter((f) => !skip.has(f.id))
    .filter((f) => !q || norm(label(f)).includes(q) || norm(f.username).includes(q))
    .sort((a, b) => {
      const byOnline = Number(isOnline(b.id)) - Number(isOnline(a.id))
      return byOnline || label(a).localeCompare(label(b), 'pt-BR')
    })
}

export function toggleSelected(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
}

/** Quantos convites saíram e quem ficou de fora (com o motivo). */
export function summarizeResults(results: InviteResult[]): {
  sent: number
  failed: InviteResult[]
} {
  const failed = results.filter((r) => r.status !== 'sent')
  return { sent: results.length - failed.length, failed }
}

/** Frase de cima do resultado do envio. */
export function sendHeadline(sent: number, total: number): string {
  if (sent === 0) return INVITE_COPY.sentNone
  return sent === total ? INVITE_COPY.sentAll(sent) : INVITE_COPY.sentSome(sent, total)
}

export type ResultTone = 'good' | 'neutral' | 'bad'

/** Texto e tom da linha de cada pessoa. */
export function resultLine(status: InviteResultStatus): { text: string; tone: ResultTone } {
  return { text: resultText(status), tone: status === 'sent' ? 'good' : 'bad' }
}

/** Mensagem quando a lista fica vazia. */
export function emptyListText(total: number, available: number): string {
  if (total === 0) return INVITE_COPY.noFriends
  return available === 0 ? INVITE_COPY.allInCall : INVITE_COPY.noMatches
}
