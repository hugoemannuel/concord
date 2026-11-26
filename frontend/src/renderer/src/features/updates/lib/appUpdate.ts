// Versão nova do app: o backend avisa pelo WS (app:update) quando o manifesto
// muda, e o WS reconectar costuma ser um deploy. Nos dois casos o main checa
// na hora (com debounce, e nada se a checagem anterior não terminou). Na web
// não existe window.api.updates: ignora.

/** Evento do backend: manifesto de atualização mudou ({ file, version }). */
export const APP_UPDATE_EVENT = 'app:update'

/** Evento do backend: o deploy publicou as notas; a versão mínima pode ter mudado (ADR 0066). */
export const CHANGELOG_UPDATE_EVENT = 'changelog:update'

export function requestUpdateCheck(): void {
  if (typeof window === 'undefined') return
  window.api?.updates?.checkNow()
}

export type UpdateFromErrorResult = 'installing' | 'checking' | 'unavailable'

/**
 * Botão "Verificar atualização" da tela de erro: se já existe versão nova,
 * instala (baixa se precisar e reinicia); senão pede uma checagem — achando,
 * a barra de atualização aparece na própria tela de erro (e acima do painel de voz). Na web: indisponível.
 */
export async function updateFromErrorScreen(): Promise<UpdateFromErrorResult> {
  const updates = typeof window === 'undefined' ? undefined : window.api?.updates
  if (!updates) return 'unavailable'
  try {
    if (await updates.status()) {
      updates.install()
      return 'installing'
    }
  } catch {
    // main sem o handler (versão antiga): só checa.
  }
  updates.checkNow()
  return 'checking'
}
