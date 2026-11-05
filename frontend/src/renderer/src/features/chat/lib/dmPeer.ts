import type { NameStyle } from '../../profile/lib/nameStyle'

// Quem está do outro lado de uma DM 1:1, a partir do que a tela já conhece
// (amigos, lista de conversas e o próprio perfil).

export interface PeerLike {
  id: string
  username?: string
  display_name?: string
  avatar_url?: string | null
  avatar_decoration_url?: string | null
  name_style?: Partial<NameStyle> | null
}

export interface DmPeer {
  other: PeerLike | undefined
  name: string
  /** @ sem o "@"; vazio se ainda não se sabe. */
  handle: string
  placeholder: string
  mentionable: { username: string; display_name: string }[]
}

/** Amigos primeiro; quem não é amigo vem da lista de conversas. */
export function dmPeer(
  userId: string | undefined,
  me: PeerLike | null | undefined,
  friends: PeerLike[],
  conversations: { other_user?: PeerLike }[]
): DmPeer {
  const other =
    friends.find((f) => f.id === userId) ??
    conversations.find((c) => c.other_user?.id === userId)?.other_user
  const isSelf = userId === me?.id
  const name = other?.display_name ?? other?.username ?? (isSelf ? me?.display_name : 'Usuário') ?? 'Usuário'
  const handle = other?.username ?? (isSelf ? me?.username : '') ?? ''
  return {
    other,
    name,
    handle,
    placeholder: `Mensagem para @${handle || name}`,
    mentionable: handle ? [{ username: handle, display_name: name }] : []
  }
}

export interface SearchUser {
  id: string
  username: string
  displayName: string
  avatarUrl?: string | null
}

/** Quem aparece no from:/mentions: da busca: eu e a outra pessoa. */
export function dmSearchUsers(
  me: PeerLike | null | undefined,
  userId: string | undefined,
  peer: DmPeer
): SearchUser[] {
  const mine: SearchUser[] = me
    ? [
        {
          id: me.id,
          username: me.username ?? '',
          displayName: me.display_name || me.username || '',
          avatarUrl: me.avatar_url
        }
      ]
    : []
  const theirs: SearchUser[] =
    userId && peer.handle && userId !== me?.id
      ? [
          {
            id: userId,
            username: peer.handle,
            displayName: peer.name,
            avatarUrl: peer.other?.avatar_url
          }
        ]
      : []
  return [...mine, ...theirs]
}

/** Alvo do menu de contexto do cabeçalho; null para si mesmo ou sem pessoa. */
export function dmMenuTarget(
  userId: string | undefined,
  meId: string | undefined,
  name: string,
  handle: string,
  conversationId: string | null
): { userId: string; name: string; username?: string; conversationId?: string } | null {
  if (!userId || userId === meId) return null
  return {
    userId,
    name,
    username: handle || undefined,
    conversationId: conversationId ?? undefined
  }
}
