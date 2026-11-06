import { create } from 'zustand'
import type { PublicUser } from '../../auth/store/authStore'
import { useAuthStore } from '../../auth/store/authStore'
import { sessionGuard } from '../../auth/lib/sessionGuard'
import type { PendingRequest, RelationshipType, SendRequestResult } from '../api/friends'
import { relationshipOf } from '../../profile/lib/relationship'
import { keepWithId } from '../../../shared/lib/listGuards'
import {
  listFriends,
  listPending,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  listBlocked,
  blockUser,
  unblockUser
} from '../api/friends'

interface FriendState {
  friends: PublicUser[]
  pending: PendingRequest[]
  blocked: PublicUser[]
  loading: boolean
  /** loadAll já respondeu uma vez: só a primeira carga mostra o skeleton. */
  loaded: boolean
  error: string | null
  fetchFriends: () => Promise<void>
  fetchPending: () => Promise<void>
  loadAll: () => Promise<void>
  sendRequest: (username: string) => Promise<SendRequestResult>
  accept: (username: string) => Promise<void>
  decline: (username: string) => Promise<void>
  cancel: (username: string) => Promise<void>
  remove: (username: string) => Promise<void>
  block: (userId: string) => Promise<void>
  unblock: (userId: string) => Promise<void>
  reset: () => void
}

const refetchOnFocus = (): void => {
  if (!useAuthStore.getState().accessToken) return
  useFriendStore.getState().loadAll()
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', refetchOnFocus)
}

export const useFriendStore = create<FriendState>()((set, get) => ({
  friends: [],
  pending: [],
  blocked: [],
  loading: false,
  loaded: false,
  error: null,
  fetchFriends: async () => {
    const sameSession = sessionGuard()
    try {
      const friends = await listFriends()
      if (!sameSession()) return
      set({ friends: keepWithId<PublicUser>(friends, 'id', 'friends') })
    } catch (err) {
      console.error('[friendStore] fetchFriends error:', err)
      if (sameSession()) set({ friends: [] })
    }
  },
  fetchPending: async () => {
    const sameSession = sessionGuard()
    try {
      const pending = await listPending()
      if (!sameSession()) return
      set({ pending: keepWithId<PendingRequest>(pending, 'user_id', 'pending') })
    } catch (err) {
      console.error('[friendStore] fetchPending error:', err)
      if (sameSession()) set({ pending: [] })
    }
  },
  loadAll: async () => {
    const sameSession = sessionGuard()
    set({ loading: true, error: null })
    try {
      const [friends, pending, blocked] = await Promise.allSettled([
        listFriends(),
        listPending(),
        listBlocked()
      ])

      if (!sameSession()) return

      const resolvedFriends =
        friends.status === 'fulfilled' ? keepWithId<PublicUser>(friends.value, 'id', 'friends') : []

      const resolvedPending =
        pending.status === 'fulfilled'
          ? keepWithId<PendingRequest>(pending.value, 'user_id', 'pending')
          : []

      if (friends.status === 'rejected') {
        console.error('[friendStore] listFriends failed:', friends.reason)
      }
      if (pending.status === 'rejected') {
        console.error('[friendStore] listPending failed:', pending.reason)
      }

      const resolvedBlocked =
        blocked.status === 'fulfilled' ? keepWithId<PublicUser>(blocked.value, 'id', 'blocked') : []

      set({
        friends: resolvedFriends,
        pending: resolvedPending,
        blocked: resolvedBlocked,
        loaded: true
      })
    } finally {
      set({ loading: false })
    }
  },
  sendRequest: async (username) => {
    const { result } = await sendFriendRequest(username)
    // Pedido cruzado vira amizade na hora: recarrega as duas listas.
    await get().loadAll()
    return result
  },
  accept: async (username) => {
    await acceptFriendRequest(username)
    await get().fetchPending()
    await get().fetchFriends()
  },
  decline: async (username) => {
    await declineFriendRequest(username)
    await get().fetchPending()
  },
  cancel: async (username) => {
    await cancelFriendRequest(username)
    await get().fetchPending()
  },
  remove: async (username) => {
    // A DM continua na lista (como no Discord); só a amizade sai.
    await removeFriend(username)
    set({ friends: get().friends.filter((f) => f.username !== username) })
    await get().fetchPending()
  },
  block: async (userId) => {
    await blockUser(userId)
    await get().loadAll()
  },
  unblock: async (userId) => {
    await unblockUser(userId)
    await get().loadAll()
  },
  reset: () =>
    set({ friends: [], pending: [], blocked: [], loading: false, loaded: false, error: null })
}))

/** Relação com alguém (amigo, pedido, bloqueado) pelo que já está carregado. */
export function useRelationship(userId: string | undefined): RelationshipType {
  return useFriendStore((s) => (userId ? relationshipOf(userId, s) : 'none'))
}
