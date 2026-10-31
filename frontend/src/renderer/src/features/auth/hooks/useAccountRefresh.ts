import { useEffect } from 'react'
import { getMe } from '../../profile/api/users'
import { refreshMe, shouldRecheckOnFocus, type AccountRefreshDeps } from '../lib/accountRefresh'
import { commitMe } from '../store/accountActions'
import { useAuthStore } from '../store/authStore'

const deps: AccountRefreshDeps = {
  getMe,
  current: () => useAuthStore.getState().user,
  // Mantém o status escolhido nesta sessão.
  commit: commitMe
}

/**
 * Relê a própria conta ao abrir o app ou logar e, enquanto o e-mail não está
 * confirmado, a cada volta para a janela: quem confirmou pelo link (no
 * navegador ou no celular) deixa de ver o aviso e pode entrar em servidores.
 */
export function useAccountRefresh(hasToken: boolean): void {
  useEffect(() => {
    if (!hasToken) return
    void refreshMe(deps)
    const onFocus = (): void => {
      if (shouldRecheckOnFocus(deps.current())) void refreshMe(deps)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [hasToken])
}
