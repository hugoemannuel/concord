import type { ServerMember } from '../../servers/api/servers'
import { serverDisplayName } from '../../servers/lib/serverNames'

/** Quem aparece no filtro "por usuário": os membros, pelo nome no servidor, em ordem alfabética. */
export function actorOptions(members: ServerMember[]): { id: string; name: string }[] {
  return members
    .map((m) => ({ id: m.user_id, name: serverDisplayName(m, m) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
