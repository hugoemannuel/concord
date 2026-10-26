import { useAuthStore } from '../store/authStore'
import { API_BASE_URL } from '../lib/config'
import {
  AUTH_STORAGE_KEY,
  isDefinitiveRejection,
  parseStoredTokens,
  planRefresh,
  planRefreshFailure,
  planRefreshSuccess,
  REFRESH_LOCK,
  runExclusive,
  type StoredTokens,
  type Tokens
} from '../lib/authRefresh'

export class ApiError extends Error {
  status: number
  /** Código do erro quando o servidor manda (ex.: "user_not_found"). */
  code?: string
  /** Corpo JSON da resposta de erro (ex.: call_id do 423 de sala trancada). */
  body: Record<string, unknown>

  constructor(status: number, message: string, codeOrBody?: string | Record<string, unknown>, body?: Record<string, unknown>) {
    super(message)
    this.status = status
    if (typeof codeOrBody === 'string') {
      this.code = codeOrBody
      this.body = body ?? {}
    } else {
      this.body = codeOrBody ?? {}
    }
  }
}

async function rawRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined)
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out', 'timeout')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const bodyRecord = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const { error, code } = bodyRecord as { error?: string; code?: string }
    const message = error ?? 'Request failed'
    const err = new ApiError(response.status, message, code, bodyRecord)
    throw err
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function storedTokens(): StoredTokens {
  try {
    return parseStoredTokens(localStorage.getItem(AUTH_STORAGE_KEY))
  } catch {
    // Sem acesso ao armazenamento: vale o que está em memória.
    const { accessToken, refreshToken } = useAuthStore.getState()
    return { accessToken, refreshToken }
  }
}

function adopt(tokens: Tokens): 'ok' {
  useAuthStore.getState().setTokens(tokens.accessToken, tokens.refreshToken)
  return 'ok'
}

/** O servidor recusou (401/403): limpa só se ninguém renovou nesse meio-tempo. */
function onRefreshRejected(failedRefreshToken: string): RefreshOutcome {
  const plan = planRefreshFailure(failedRefreshToken, storedTokens())
  if (plan.kind === 'adopt') return adopt(plan.tokens)
  useAuthStore.getState().clear()
  return 'rejected'
}

/** Resultado da renovação. 'unavailable' = rede/servidor fora: o login fica. */
export type RefreshOutcome = 'ok' | 'rejected' | 'unavailable'

const REFRESH_TIMEOUT_MS = 15_000

function locks(): LockManager | undefined {
  return typeof navigator !== 'undefined' ? navigator.locks : undefined
}

async function refreshLocked(failedAccessToken: string | null): Promise<RefreshOutcome> {
  const plan = planRefresh(failedAccessToken, storedTokens())
  if (plan.kind === 'adopt') return adopt(plan.tokens)
  if (plan.kind === 'logged-out') {
    // Outra aba saiu da conta: esta acompanha (sem nada para renovar).
    if (useAuthStore.getState().refreshToken) useAuthStore.getState().clear()
    return 'rejected'
  }

  let response: Response
  let data: { access_token: string; refresh_token: string }
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: plan.refreshToken }),
      // Servidor travado não pode segurar o lock (e todas as abas) para sempre.
      signal: AbortSignal.timeout?.(REFRESH_TIMEOUT_MS)
    })
    if (!response.ok) {
      return isDefinitiveRejection(response.status)
        ? onRefreshRejected(plan.refreshToken)
        : 'unavailable'
    }
    data = (await response.json()) as typeof data
  } catch {
    // Rede caiu ou tempo esgotado: não é recusa, o login continua salvo.
    return 'unavailable'
  }

  const saved = planRefreshSuccess(plan.refreshToken, storedTokens(), {
    accessToken: data.access_token,
    refreshToken: data.refresh_token
  })
  if (saved.kind === 'save' || saved.kind === 'adopt') return adopt(saved.tokens)
  // Saiu da conta enquanto renovava: os tokens novos são descartados.
  if (useAuthStore.getState().refreshToken) useAuthStore.getState().clear()
  return 'rejected'
}

let inflight: Promise<RefreshOutcome> | null = null

/**
 * Renova o access token. Uma renovação por vez: na mesma aba os 401
 * simultâneos esperam a mesma; entre abas, o Web Lock faz cada uma esperar a
 * outra e, ao entrar, usar os tokens que a anterior salvou.
 */
async function refreshSession(
  failedAccessToken: string | null = useAuthStore.getState().accessToken
): Promise<RefreshOutcome> {
  if (!useAuthStore.getState().refreshToken && !storedTokens().refreshToken) return 'rejected'
  inflight ??= runExclusive(locks(), REFRESH_LOCK, () => refreshLocked(failedAccessToken)).finally(
    () => {
      inflight = null
    }
  )
  return inflight
}

/** Como refreshSession, mas só diz se renovou. */
async function refreshTokens(failedAccessToken?: string | null): Promise<boolean> {
  return (await refreshSession(failedAccessToken)) === 'ok'
}

/**
 * Sai da conta localmente sob o mesmo lock da renovação: uma renovação em
 * andamento (nesta ou noutra aba) termina antes e, ao ver a sessão vazia,
 * descarta os tokens novos.
 */
function clearSession(): Promise<void> {
  return runExclusive(locks(), REFRESH_LOCK, async () => useAuthStore.getState().clear())
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { accessToken } = useAuthStore.getState()

  try {
    return await rawRequest<T>(path, options, accessToken ?? undefined)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && accessToken) {
      const outcome = await refreshSession(accessToken)
      if (outcome === 'ok') {
        const newToken = useAuthStore.getState().accessToken
        return rawRequest<T>(path, options, newToken ?? undefined)
      }
      // Sem rede para renovar: não é "login inválido" (quem chama não desloga).
      if (outcome === 'unavailable') throw new ApiError(0, 'Sem conexão com o servidor')
    }
    throw err
  }
}

export { clearSession, rawRequest, refreshSession, refreshTokens, request }
