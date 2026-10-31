import { useEffect } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { useGifFavoritesStore } from '../store/gifFavoritesStore'

type Store = ReturnType<typeof useGifFavoritesStore.getState>

/** Favoritos de GIF da pessoa; carrega na primeira vez que `enabled` (e de novo se trocar de conta). */
export function useGifFavorites(enabled: boolean): {
  favorites: Store['favorites']
  toggle: Store['toggle']
} {
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const favorites = useGifFavoritesStore((s) => s.favorites)
  const load = useGifFavoritesStore((s) => s.load)
  const toggle = useGifFavoritesStore((s) => s.toggle)

  useEffect(() => {
    if (enabled && userId) void load(userId)
  }, [enabled, userId, load])

  return { favorites, toggle }
}
