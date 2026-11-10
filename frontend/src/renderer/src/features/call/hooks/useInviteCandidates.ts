import { useMemo } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { useChatStore } from '../../chat/store/chatStore'
import { useFriendStore } from '../../friends/store/friendStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useCallStore } from '../store/callStore'
import { INVITE_COPY } from '../lib/callInviteCopy'
import { invitableFriends, type InvitableFriend } from '../lib/inviteFriendsList'
import { serverInvitees } from '../lib/invitePeople'

export interface InviteSectionData {
  key: 'friends' | 'members'
  title: string
  people: InvitableFriend[]
}

export interface InviteCandidates {
  loaded: boolean
  sections: InviteSectionData[]
  /** Quantas pessoas existem para convidar (amigos + membros), antes de tirar quem está na call. */
  total: number
  /** Quantas sobram fora da call, sem a busca. */
  available: number
}

/**
 * Quem a janela oferece: amigos e, numa seção própria, os membros do servidor
 * aberto (o botão fica na linha do canal de voz dele) que não são amigos.
 */
export function useInviteCandidates(query: string): InviteCandidates {
  const friends = useFriendStore((s) => s.friends)
  const loaded = useFriendStore((s) => s.loaded)
  const members = useServerStore((s) => s.currentMembers)
  const selfId = useAuthStore((s) => s.user?.id)
  const presence = useChatStore((s) => s.presence)
  const participants = useCallStore((s) => s.participants)

  const others = useMemo(
    () => serverInvitees(members, friends.map((f) => f.id), selfId),
    [members, friends, selfId]
  )
  return useMemo(() => {
    const inCall = participants.map((p) => p.id)
    const online = (id: string): boolean => Boolean(presence[id])
    const everyone = [...friends, ...others]
    return {
      loaded,
      sections: [
        { key: 'friends', title: INVITE_COPY.friendsSection, people: invitableFriends(friends, inCall, query, online) },
        { key: 'members', title: INVITE_COPY.membersSection, people: invitableFriends(others, inCall, query, online) }
      ],
      total: everyone.length,
      available: invitableFriends(everyone, inCall, '', () => true).length
    }
  }, [friends, others, participants, presence, query, loaded])
}
