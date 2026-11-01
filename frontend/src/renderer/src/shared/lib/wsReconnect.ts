// Reconexão do WebSocket do chat. No deploy o servidor fecha as conexões com
// 1012 ("servidor reiniciando") e volta em instantes: o app reconecta logo,
// sem o backoff normal e sem aviso na tela, a não ser que demore (wsStatus).

/** Código de fechamento que o backend manda ao reiniciar (Service Restart). */
export const SERVICE_RESTART_CLOSE_CODE = 1012

const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 30000
/** Primeira tentativa após o reinício: 100–300 ms, espalhando os clientes. */
const RESTART_FIRST_MIN_MS = 100
const RESTART_FIRST_JITTER_MS = 200
/** Se o servidor ainda não voltou (sem Caddy segurando): 250 ms, 500 ms, 1 s… */
const RESTART_BACKOFF_BASE_MS = 250

/**
 * Sessão encerrada (saiu de todos os dispositivos, redefiniu a senha ou
 * excluiu a conta): o token não vale mais, então não adianta reconectar.
 */
export const SESSION_REVOKED_CLOSE_CODE = 4001

export function isSessionRevoked(closeCode: number): boolean {
  return closeCode === SESSION_REVOKED_CLOSE_CODE
}

export function isPlannedRestart(closeCode: number): boolean {
  return closeCode === SERVICE_RESTART_CLOSE_CODE
}

/**
 * Espera antes da tentativa `attempt` (0 = a primeira depois da queda).
 * `planned` vale até a conexão voltar: as tentativas que falham no meio do
 * reinício chegam com outro código.
 */
export function reconnectDelay(
  attempt: number,
  planned: boolean,
  random: () => number = Math.random
): number {
  if (!planned) return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS)
  if (attempt === 0) return Math.round(RESTART_FIRST_MIN_MS + random() * RESTART_FIRST_JITTER_MS)
  const base = Math.min(RESTART_BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS)
  // ±25%: os clientes não voltam todos no mesmo milissegundo.
  return Math.round(Math.min(base * (0.75 + random() * 0.5), BACKOFF_MAX_MS))
}
