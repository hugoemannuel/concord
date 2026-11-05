import { useAuthStore } from '../../auth/store/authStore'
import { useFriendStore, useRelationship } from '../../friends/store/friendStore'
import type { PresenceStatus } from '../../friends/lib/presenceStatus'
import { isBotUser } from '../../music/lib/bots'
import { useUserLook } from '../../profile/store/profileStore'
import { dmAccess, type DmAccess } from '../lib/dmAccess'
import { dmPeer, dmSearchUsers, type DmPeer, type SearchUser } from '../lib/dmPeer'
import { useChatStore, usePresenceStatus } from '../store/chatStore'

export interface DmPeerView {
  peer: DmPeer
  /** Nome e avatar como a pessoa configurou (perfil ao vivo). */
  look: { name: string; avatarUrl: string | null; decorationUrl?: string | null }
  status: PresenceStatus
  online: boolean
  blocked: boolean
  withBot: boolean
  access: DmAccess
  searchUsers: SearchUser[]
}

/** Tudo que o cabeçalho e o chat da DM precisam saber da outra pessoa. */
export function useDmPeer(userId: string | undefined): DmPeerView {
  const me = useAuthStore((s) => s.user)
  const friends = useFriendStore((s) => s.friends)
  const conversations = useChatStore((s) => s.conversations)
  const online = useChatStore((s) => Boolean(userId && s.presence[userId]))
  const status = usePresenceStatus(userId)
  const blocked = useRelationship(userId) === 'blocked'
  const withBot = isBotUser(userId)
  const peer = dmPeer(userId, me, friends, conversations)
  const look = useUserLook(userId, {
    name: peer.name,
    avatarUrl: peer.other?.avatar_url,
    decorationUrl: peer.other?.avatar_decoration_url
  })
  return {
    peer,
    look,
    status,
    online,
    blocked,
    withBot,
    access: dmAccess(withBot, blocked),
    searchUsers: dmSearchUsers(me, userId, peer)
  }
}
