import type { ServerMember } from '../../servers/api/servers'
import type { InvitableFriend } from './inviteFriendsList'

/**
 * Membros do servidor da call que a lista oferece além dos amigos: sem quem
 * convida e sem quem já aparece como amigo (cada pessoa numa seção só). O
 * servidor valida tudo de novo (bloqueio, acesso ao canal, DM fechada).
 */
export function serverInvitees(
  members: ServerMember[],
  friendIds: string[],
  selfId: string | undefined
): InvitableFriend[] {
  const skip = new Set(friendIds)
  if (selfId) skip.add(selfId)
  return members
    .filter((m) => m.username && !skip.has(m.user_id))
    .map((m) => ({
      id: m.user_id,
      username: m.username ?? '',
      display_name: m.display_name ?? '',
      avatar_url: m.avatar_url,
      avatar_decoration_url: m.avatar_decoration_url
    }))
}

/** "Selecionar todos" de uma seção: marca os que faltam ou, se já estão todos, desmarca. */
export function toggleAll(selected: string[], ids: string[]): string[] {
  const all = ids.length > 0 && ids.every((id) => selected.includes(id))
  if (all) return selected.filter((id) => !ids.includes(id))
  return [...selected, ...ids.filter((id) => !selected.includes(id))]
}

/** Lotes de até `size` (o servidor aceita no máximo 20 convidados por requisição). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
