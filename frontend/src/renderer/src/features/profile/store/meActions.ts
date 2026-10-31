import { logout } from '../../auth/api/auth'
import { clearSession } from '../../../shared/api/client'
import { setStatus } from '../api/users'
import type { ChosenStatus } from '../../friends/lib/presenceStatus'
import router from '../../../app/router'
import { useAuthStore } from '../../auth/store/authStore'
import { useChannelNameStore } from '../../servers/store/channelNameStore'
import { useChatStore } from '../../chat/store/chatStore'
import { endSessionState } from '../../auth/store/sessionEnd'
import { useFriendStore } from '../../friends/store/friendStore'
import { useInviteStore } from '../../servers/store/inviteStore'
import { useProfileCardStore } from './profileCardStore'
import { useProfileStore } from './profileStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useSettingsStore } from '../../settings/store/settingsStore'
import { showToast } from '../../../shared/store/toastStore'

// Ações da própria pessoa usadas pela barra de baixo, pelo cartão de perfil e
// pelas Configurações.

/** Sai da conta: encerra a sessão no servidor (se der) e limpa tudo local. */
export async function logoutAndReset(): Promise<void> {
  // Antes de fechar o WebSocket: o aviso de saída da chamada vai por ele, e a
  // chamada (microfone, LiveKit) não pode passar para a próxima conta.
  endSessionState()
  try {
    await logout()
  } catch {
    // Limpa a sessão local mesmo assim.
  } finally {
    await resetLocalSession()
  }
}

/** Limpa tudo o que é da conta neste app e volta para o login. */
async function resetLocalSession(): Promise<void> {
  useFriendStore.getState().reset()
  useServerStore.getState().reset()
  useInviteStore.getState().reset()
  useProfileStore.getState().reset()
  useChannelNameStore.getState().reset()
  useChatStore.getState().disconnect()
  useProfileCardStore.getState().close()
  useSettingsStore.getState().forceClose()
  await clearSession()
  void router.navigate('/login')
}


/** Troca o status na hora e desfaz se o servidor recusar. */
export async function changeMyStatus(status: ChosenStatus): Promise<void> {
  const { user, setUser } = useAuthStore.getState()
  if (!user || user.status === status) return
  const previous = user.status
  setUser({ ...user, status })
  try {
    const saved = await setStatus(status)
    const current = useAuthStore.getState().user
    if (current) setUser({ ...current, status: saved.status ?? status })
  } catch (err) {
    const current = useAuthStore.getState().user
    if (current) setUser({ ...current, status: previous })
    showToast.error(err instanceof Error ? err.message : 'Não foi possível mudar o status.')
  }
}
