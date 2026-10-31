import { API_BASE_URL } from '../../../shared/lib/config'
import { useAuthStore } from '../../auth/store/authStore'
import { playNotes, setSoundHandler } from '../../call/lib/sounds'
import { useAppSoundsStore } from '../store/appSoundsStore'
import { createAppSoundHandler } from './appSoundHandler'
import { playClip, stopClip } from './clipPlayer'

/** Quem mudou de conta (entrou, saiu ou trocou): carrega ou limpa os sons. */
export function syncWithAccount(userId: string | undefined, previous: string | undefined): void {
  if (userId === previous) return
  const store = useAppSoundsStore.getState()
  if (userId) void store.load()
  else store.reset()
}

/**
 * Liga os sons escolhidos (Configurações → Notificações) ao playSound e os
 * carrega do servidor a cada login. Chamado uma vez na entrada do app.
 */
export function startAppSounds(): () => void {
  setSoundHandler(
    createAppSoundHandler({
      read: () => useAppSoundsStore.getState(),
      apiBase: API_BASE_URL,
      playNotes,
      playClip,
      stopClip
    })
  )
  syncWithAccount(useAuthStore.getState().user?.id, undefined)
  const offAuth = useAuthStore.subscribe((next, prev) => syncWithAccount(next.user?.id, prev.user?.id))
  return () => {
    offAuth()
    setSoundHandler(null)
  }
}
