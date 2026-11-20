import type { Message } from '../api/messages'
import { useAuthStore } from '../../auth/store/authStore'
import { roleIdsOf, useMyRolesStore } from '../../servers/store/myRolesStore'
import { useServerStore } from '../../servers/store/serverStore'
import { rolePingsMe } from '../lib/mentions'

/**
 * A mensagem pingou um cargo meu? Mensagem de canal é sempre do servidor
 * aberto; a minha própria e a que não pingou cargo nem chegam a consultar.
 */
export function useRolePingsMe(message: Pick<Message, 'author_id' | 'mention_roles'>): boolean {
  const meId = useAuthStore((s) => s.user?.id)
  const pinged = message.mention_roles?.length && message.author_id !== meId
  const serverId = useServerStore((s) => (pinged ? s.currentServer?.id : undefined))
  return useMyRolesStore((s) => rolePingsMe(message.mention_roles, roleIdsOf(s, meId, serverId)))
}
