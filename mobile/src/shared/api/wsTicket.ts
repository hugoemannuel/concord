import { WS_URL } from '../lib/config'
import { ApiError, request } from './client'

// Porte do frontend (renderer/src/shared/api/wsTicket.ts; docs/adr/0046): o
// token de acesso não vai mais na URL do WebSocket. O app troca o Bearer por
// um ticket de uso único e 30 s e conecta com ?ticket=. Servidor antigo, sem
// a rota: ?token= como antes. client=mobile: o servidor só manda push quando
// o app do celular não está aberto (o desktop não conta).

function withParam(param: 'ticket' | 'token', value: string): string {
  return `${WS_URL}?${param}=${encodeURIComponent(value)}&client=mobile`
}

/** Sessão acabou no pedido: não conecta. Servidor antigo (404): ?token=. Resto: lança (tenta de novo). */
function fallback(err: unknown, token: string | null): string | null {
  if (!token) return null
  if (err instanceof ApiError && err.status === 404) return withParam('token', token)
  throw err
}

/** null = sem sessão (não conecta). Lança quando o servidor não respondeu: o WsClient tenta de novo com espera. */
export async function wsConnectUrl(getToken: () => string | null): Promise<string | null> {
  if (!getToken()) return null
  try {
    const { ticket } = await request<{ ticket: string }>('/ws/ticket', { method: 'POST' })
    return withParam('ticket', ticket)
  } catch (err) {
    return fallback(err, getToken())
  }
}
