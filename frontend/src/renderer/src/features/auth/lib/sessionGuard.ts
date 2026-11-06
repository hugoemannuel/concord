import { useAuthStore } from '../store/authStore'

/**
 * Marca a sessão de agora; a função devolvida diz se ela ainda é a mesma.
 * Use antes de uma requisição para descartar a resposta que chega depois de
 * sair ou trocar de conta. Renovar o token no meio não conta como troca.
 */
export function sessionGuard(): () => boolean {
  const epoch = useAuthStore.getState().sessionEpoch
  return () => useAuthStore.getState().sessionEpoch === epoch
}
