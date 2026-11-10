import { useEffect } from 'react'
import { useAuthStore } from '../../auth/store/authStore'
import { useMessageFavoritesStore } from '../store/messageFavoritesStore'

/**
 * Se a mensagem é favorita e o liga/desliga do menu. Os ids carregam na
 * primeira vez que `enabled` (a barra de ações aparece), não a cada mensagem.
 */
export function useMessageFavorite(
  messageId: string,
  enabled: boolean
): { isFavorite: boolean; toggle: () => void } {
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const isFavorite = useMessageFavoritesStore((s) => Boolean(s.ids[messageId]))
  const loadIds = useMessageFavoritesStore((s) => s.loadIds)

  useEffect(() => {
    if (enabled && userId) void loadIds(userId)
  }, [enabled, userId, loadIds])

  return {
    isFavorite,
    toggle: () => void useMessageFavoritesStore.getState().toggle(messageId)
  }
}
