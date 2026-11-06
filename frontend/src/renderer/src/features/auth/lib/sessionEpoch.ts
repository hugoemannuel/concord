/** O que importa do authStore para saber se a sessão mudou. */
export interface SessionSnapshot {
  accessToken: string | null
  user: { id: string } | null
}

/**
 * A mudança no login começou outra sessão? Entrar, sair ou trocar de conta
 * sim; renovar o token (401 → refresh) ou carregar a conta depois do login,
 * não: a resposta de uma requisição feita antes continua valendo.
 */
export function isNewSession(prev: SessionSnapshot, next: SessionSnapshot): boolean {
  if (!prev.accessToken || !next.accessToken) return prev.accessToken !== next.accessToken
  return !!prev.user && !!next.user && prev.user.id !== next.user.id
}
