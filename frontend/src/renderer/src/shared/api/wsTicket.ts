import { WS_URL } from '../lib/config'
import { ApiError, request } from './client'

// Endereço para abrir o WebSocket (docs/adr/0046). O token de acesso (24 h)
// não vai mais na URL: o app troca o Bearer por um ticket de uso único e 30 s
// (POST /api/ws/ticket) e conecta com ?ticket=. Servidor antigo, sem a rota:
// conecta com ?token= como antes.

function withParam(param: 'ticket' | 'token', value: string): string {
  return `${WS_URL}?${param}=${encodeURIComponent(value)}`
}

/** Sessão acabou no pedido: não conecta. Servidor antigo (404): ?token=. Resto: lança (tenta de novo). */
function fallback(err: unknown, token: string | null): string | null {
  if (!token) return null
  if (err instanceof ApiError && err.status === 404) return withParam('token', token)
  throw err
}

/**
 * null = sem sessão (não conecta). Lança quando o servidor não respondeu: o
 * WsClient conta como queda e tenta de novo com espera. O request() já renova
 * o token num 401 e limpa o login se a sessão acabou.
 */
export async function wsConnectUrl(getToken: () => string | null): Promise<string | null> {
  if (!getToken()) return null
  try {
    const { ticket } = await request<{ ticket: string }>('/ws/ticket', { method: 'POST' })
    return withParam('ticket', ticket)
  } catch (err) {
    return fallback(err, getToken())
  }
}
