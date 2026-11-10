import { create } from 'zustand'
import { ApiError } from '../../../shared/api/client'
import { showToast } from '../../../shared/store/toastStore'
import {
  addMessageFavorite,
  listMessageFavoriteIds,
  listMessageFavorites,
  removeMessageFavorite,
  type MessageFavorite
} from '../api/messageFavorites'

/** Limite de favoritas por pessoa (o mesmo do backend). */
export const MAX_MESSAGE_FAVORITES = 500

/**
 * Mensagens favoritas da pessoa (ADR 0061). Os ids dizem ao menu da mensagem
 * se ela já é favorita; a lista completa só carrega na tela das favoritas.
 */
interface MessageFavoritesState {
  ids: Record<string, true>
  /** De quem são os ids carregados (trocar de conta recarrega); null = ainda não carregou. */
  ownerId: string | null
  /** A lista da tela; null = ainda não abriu. */
  items: MessageFavorite[] | null
  loadingList: boolean
  listError: string | null
  loadIds: (userId: string) => Promise<void>
  loadList: () => Promise<void>
  /** Favorita ou tira na hora; se o servidor recusar, desfaz e avisa. */
  toggle: (messageId: string) => Promise<void>
}

function failureMessage(err: unknown, adding: boolean): string {
  if (adding && err instanceof ApiError && err.status === 409) {
    return `Limite de ${MAX_MESSAGE_FAVORITES} mensagens favoritas.`
  }
  return adding ? 'Não foi possível favoritar a mensagem.' : 'Não foi possível remover das favoritas.'
}

const idsOf = (favs: MessageFavorite[]): Record<string, true> =>
  Object.fromEntries(favs.map((f) => [f.message_id, true as const]))

function without(ids: Record<string, true>, messageId: string): Record<string, true> {
  const next = { ...ids }
  delete next[messageId]
  return next
}

// Muitas mensagens na tela pedem os ids ao mesmo tempo: só uma busca por vez.
let loadingIds: Promise<void> | null = null

export const useMessageFavoritesStore = create<MessageFavoritesState>()((set, get) => ({
  ids: {},
  ownerId: null,
  items: null,
  loadingList: false,
  listError: null,

  loadIds: (userId) => {
    if (get().ownerId === userId) return Promise.resolve()
    if (get().ownerId !== null) set({ ids: {}, ownerId: null, items: null })
    loadingIds ??= listMessageFavoriteIds()
      .then((ids) => set({ ids: Object.fromEntries(ids.map((id) => [id, true as const])), ownerId: userId }))
      .catch(() => undefined)
      .finally(() => {
        loadingIds = null
      })
    return loadingIds
  },

  loadList: async () => {
    set({ loadingList: true, listError: null })
    try {
      const items = await listMessageFavorites()
      set({ items, ids: idsOf(items), loadingList: false })
    } catch {
      set({ loadingList: false, listError: 'Não foi possível carregar as favoritas.' })
    }
  },

  toggle: async (messageId) => {
    const { ids, items } = get()
    const adding = !ids[messageId]
    set({
      ids: adding ? { ...ids, [messageId]: true } : without(ids, messageId),
      items: adding ? items : (items?.filter((f) => f.message_id !== messageId) ?? null)
    })
    try {
      if (!adding) {
        await removeMessageFavorite(messageId)
        return
      }
      const fav = await addMessageFavorite(messageId)
      const current = get().items
      if (current) set({ items: [fav, ...current.filter((f) => f.message_id !== messageId)] })
      showToast.success('Mensagem adicionada às favoritas.')
    } catch (err) {
      set({ ids: adding ? without(get().ids, messageId) : { ...get().ids, [messageId]: true }, items })
      showToast.error(failureMessage(err, adding))
    }
  }
}))
