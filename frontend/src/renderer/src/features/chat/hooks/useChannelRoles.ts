import { useServerStore } from '../../servers/store/serverStore'
import type { MentionableRole } from '../lib/roleMentions'

const NO_ROLES: MentionableRole[] = []

/**
 * Os cargos que o campo de mensagem pode sugerir no "@": os do servidor
 * aberto, quando a sala é um canal dele. Em DM e grupo, nenhum.
 */
export function useChannelRoles(serverId: string | undefined): MentionableRole[] {
  return useServerStore((s) => (serverId ? s.roles : NO_ROLES))
}
