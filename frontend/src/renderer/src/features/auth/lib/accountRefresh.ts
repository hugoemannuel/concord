// Releitura da própria conta. A cópia salva no aparelho (localStorage) pode
// estar velha: o e-mail confirmado pelo link, que abre no navegador ou no
// celular, não chega sozinho ao app que já estava logado.
import type { User } from '../store/authStore'

export interface AccountRefreshDeps {
  getMe(): Promise<User>
  /** A conta em memória agora (null: saiu). */
  current(): User | null
  commit(user: User): void
}

/**
 * Relê a conta no servidor e grava. Sem conexão fica com a cópia salva (se o
 * servidor recusar a sessão, o cliente da API já a encerra). Se a pessoa saiu
 * ou trocou de conta enquanto relia, a resposta é descartada.
 */
export async function refreshMe(deps: AccountRefreshDeps): Promise<void> {
  let fresh: User
  try {
    fresh = await deps.getMe()
  } catch {
    return
  }
  if (deps.current()?.id === fresh.id) deps.commit(fresh)
}

/** Voltar para a janela relê a conta só enquanto o e-mail não foi confirmado. */
export function shouldRecheckOnFocus(user: User | null): boolean {
  return user?.email_verified === false
}
