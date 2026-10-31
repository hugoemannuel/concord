import { create } from 'zustand'
import { ApiError } from '../../../shared/api/client'
import { showToast } from '../../../shared/store/toastStore'
import type { GiphyItem } from '../api/giphy'
import { addFavoriteGif, listFavoriteGifs, removeFavoriteGif } from '../api/gifFavorites'
import { MAX_GIF_FAVORITES } from '../lib/gifFavorites'

/**
 * GIFs favoritos da pessoa (a estrela no seletor e nos GIFs do chat). Ficam
 * no servidor e valem em qualquer aparelho; o mais recente vem primeiro.
 */
interface GifFavoritesState {
  favorites: GiphyItem[]
  /** De quem é a lista carregada (trocar de conta recarrega); null = ainda não carregou. */
  ownerId: string | null
  load: (userId: string) => Promise<void>
  /** Liga ou desliga a estrela na hora; se o servidor recusar, desfaz e avisa. */
  toggle: (gif: GiphyItem) => Promise<void>
}

function failureMessage(err: unknown, adding: boolean): string {
  if (adding && err instanceof ApiError && err.status === 409) {
    return `Limite de ${MAX_GIF_FAVORITES} GIFs favoritos.`
  }
  return adding ? 'Não foi possível favoritar o GIF.' : 'Não foi possível desfavoritar o GIF.'
}

// Muitos GIFs no chat pedem a lista ao mesmo tempo: só uma busca por vez.
let loading: Promise<void> | null = null

export const useGifFavoritesStore = create<GifFavoritesState>()((set, get) => ({
  favorites: [],
  ownerId: null,

  load: (userId) => {
    if (get().ownerId === userId) return Promise.resolve()
    if (get().ownerId !== null) set({ favorites: [], ownerId: null })
    loading ??= listFavoriteGifs()
      .then((favorites) => set({ favorites, ownerId: userId }))
      .catch(() => undefined)
      .finally(() => {
        loading = null
      })
    return loading
  },

  toggle: async (gif) => {
    const before = get().favorites
    const adding = !before.some((f) => f.id === gif.id)
    set({ favorites: adding ? [gif, ...before] : before.filter((f) => f.id !== gif.id) })
    try {
      set({ favorites: adding ? await addFavoriteGif(gif) : await removeFavoriteGif(gif.id) })
    } catch (err) {
      set({ favorites: before })
      showToast.error(failureMessage(err, adding))
    }
  }
}))
