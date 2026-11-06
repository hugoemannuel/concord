import type { StoreApi } from 'zustand'
import { useAuthStore } from '../../auth/store/authStore'
import { listConversations } from '../api/conversations'
import { sanitizeConversations } from '../lib/conversations'
import type { PresenceMap } from '../../friends/api/presence'
import { fetchActivities, fetchPresence } from '../../friends/api/presence'
import { presenceStatusOf, type PresenceStatus } from '../../friends/lib/presenceStatus'
import { listChannels } from '../../servers/api/channels'
import { usePresenceActivityStore } from '../../activity/store/presenceActivityStore'
import type { ChatState } from './chatStore'

// Listas do chat que vêm do servidor (conversas, presença, canais por
// servidor), separadas do chatStore, que só junta as ações.

type Set = StoreApi<ChatState>['setState']
type Get = StoreApi<ChatState>['getState']

export function chatListActions(
  set: Set,
  get: Get
): Pick<ChatState, 'fetchConversations' | 'fetchPresenceFor' | 'fetchChannelsForServers'> {
  return {
    fetchConversations: async () => {
      const token = useAuthStore.getState().accessToken
      set({ conversationsLoading: true })
      try {
        const conversations = await listConversations()
        if (useAuthStore.getState().accessToken !== token) return
        // Linha fora do formato (null, sem id, sem membros) não derruba a lista.
        const list = sanitizeConversations(conversations)
        // Não lidas vêm do servidor (sobrevivem ao reload); a aberta fica zerada.
        set((state) => {
          const unreadByRoom = { ...state.unreadByRoom }
          for (const c of list) {
            const room = `conversation:${c.id}`
            unreadByRoom[room] = room === state.activeRoom ? 0 : (c.unread_count ?? 0)
          }
          return { conversations: list, unreadByRoom, conversationsLoaded: true }
        })
        const meId = useAuthStore.getState().user?.id
        const ids = list
          .flatMap((c) => (c.members ?? []).map((m) => m.id))
          .filter((id) => id !== meId)
        if (ids.length > 0) await get().fetchPresenceFor(ids)
      } catch (err) {
        console.error('[chatStore] fetchConversations error:', err)
        if (useAuthStore.getState().accessToken === token) set({ conversationsLoaded: true })
      } finally {
        set({ conversationsLoading: false })
      }
    },
    fetchPresenceFor: async (userIds) => {
      const unique = Array.from(new Set(userIds.filter(Boolean)))
      if (unique.length === 0) return
      const token = useAuthStore.getState().accessToken
      try {
        const map: PresenceMap = await fetchPresence(unique)
        if (useAuthStore.getState().accessToken !== token) return
        const presence: Record<string, boolean> = {}
        const statuses: Record<string, PresenceStatus> = {}
        for (const [id, value] of Object.entries(map)) {
          const status = presenceStatusOf(value, value === true)
          statuses[id] = status
          presence[id] = status !== 'offline'
        }
        set((state) => ({
          presence: { ...state.presence, ...presence },
          statuses: { ...state.statuses, ...statuses }
        }))
        // Atividade vem à parte: backend antigo não tem a rota (erro = ignora).
        fetchActivities(unique)
          .then((activities) => {
            if (useAuthStore.getState().accessToken !== token) return
            usePresenceActivityStore.getState().applyFetched(unique, activities)
          })
          .catch(() => {})
      } catch (err) {
        console.error('[chatStore] fetchPresenceFor error:', err)
      }
    },
    fetchChannelsForServers: async (serverIds) => {
      const unique = Array.from(new Set(serverIds.filter(Boolean)))
      if (unique.length === 0) return
      const token = useAuthStore.getState().accessToken
      try {
        const results = await Promise.all(unique.map((id) => listChannels(id)))
        if (useAuthStore.getState().accessToken !== token) return
        const map: Record<string, string[]> = {}
        unique.forEach((id, i) => {
          map[id] = Array.isArray(results[i]) ? results[i].map((c) => c.id) : []
        })
        set((state) => ({ channelsByServer: { ...state.channelsByServer, ...map } }))
      } catch (err) {
        console.error('[chatStore] fetchChannelsForServers error:', err)
      }
    }
  }
}
