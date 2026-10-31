// Pessoas: presença, perfil atualizado e amizades.
import type { PublicProfile } from '../../../profile/api/users'
import type { WsHandler } from './context'
import { ping } from './alerts'
import { useProfileStore } from '../../../profile/store/profileStore'
import { useAuthStore } from '../../../auth/store/authStore'
import { useServerStore } from '../../../servers/store/serverStore'
import { useFriendStore } from '../../../friends/store/friendStore'
import { presenceStatusOf } from '../../../friends/lib/presenceStatus'
import { friendRequestNotification } from '../../../notifications/lib/notifications'
import { showToast } from '../../../../shared/store/toastStore'

interface FriendUser {
  id: string
  username: string
  display_name: string
}

type Look = Pick<PublicProfile, 'display_name' | 'avatar_url' | 'name_style'>

/** O que muda na aparência da pessoa em listas (nome, foto, estilo do nome). */
export const lookOf = (profile: PublicProfile): Look => ({
  display_name: profile.display_name,
  avatar_url: profile.avatar_url ?? null,
  ...(profile.name_style ? { name_style: profile.name_style } : {})
})

function applyToSession(profile: PublicProfile): void {
  const auth = useAuthStore.getState()
  // O status da sessão é o escolhido (ex.: invisível), não o efetivo.
  if (auth.user?.id === profile.id)
    auth.setUser({
      ...auth.user,
      ...profile,
      // Ausente no evento = tirou (o JSON omite): não fica a faixa velha.
      nameplate_url: profile.nameplate_url ?? null,
      avatar_decoration_url: profile.avatar_decoration_url ?? null,
      status: auth.user.status
    })
}

function applyToMembers(userId: string, look: Look): void {
  const servers = useServerStore.getState()
  const serverId = servers.currentServer?.id
  const member = servers.currentMembers.find((m) => m.user_id === userId)
  if (serverId && member) servers.updateMember(serverId, { ...member, ...look })
}

function applyToFriends(userId: string, look: Look): void {
  const friends = useFriendStore.getState().friends
  if (!friends.some((f) => f.id === userId)) return
  useFriendStore.setState({
    friends: friends.map((f) => (f.id === userId ? { ...f, ...look } : f))
  })
}

/**
 * Perfil novo de alguém (evento user:update): o cache de perfis (que avatar e
 * nome leem em todo lugar), a própria sessão, a lista de membros e de amigos.
 */
export function applyUserUpdate(profile: PublicProfile): void {
  useProfileStore.getState().apply(profile)
  const look = lookOf(profile)
  applyToSession(profile)
  applyToMembers(profile.id, look)
  applyToFriends(profile.id, look)
}

const handlePresence: WsHandler = (payload, ctx) => {
  const userId = payload.user_id as string
  const status = presenceStatusOf(payload.status, Boolean(payload.online))
  ctx.set((state) => ({
    presence: { ...state.presence, [userId]: status !== 'offline' },
    statuses: { ...state.statuses, [userId]: status }
  }))
}

// Alguém mudou nome/foto/banner/bio: atualiza onde a pessoa aparece.
const handleUserUpdate: WsHandler = (payload) => {
  const profile = payload.user as PublicProfile | undefined
  if (profile?.id) applyUserUpdate(profile)
}

const reloadFriends = (): void => {
  useFriendStore.getState().loadAll()
}

// Pedido de amizade: som + notificação (Não perturbe silencia).
const handleFriendRequest: WsHandler = (payload) => {
  reloadFriends()
  const user = payload.user as FriendUser | undefined
  if (!user) return
  ping(friendRequestNotification(user))
  showToast.info(`${user.display_name} (@${user.username}) te enviou um pedido de amizade`)
}

const handleFriendAccepted: WsHandler = (payload) => {
  reloadFriends()
  const user = payload.user as FriendUser | undefined
  if (user) showToast.success(`${user.display_name} aceitou seu pedido de amizade`)
}

export const PEOPLE_HANDLERS: Record<string, WsHandler> = {
  'presence:update': handlePresence,
  'user:update': handleUserUpdate,
  'friend:request': handleFriendRequest,
  'friend:request:accepted': handleFriendAccepted,
  // Recusa, cancelamento, remoção e bloqueio só atualizam as listas (o
  // Discord também não avisa).
  'friend:request:declined': reloadFriends,
  'friend:request:cancelled': reloadFriends,
  'friend:removed': reloadFriends,
  'relationship:blocked': reloadFriends,
  'relationship:unblocked': reloadFriends
}
