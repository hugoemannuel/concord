import { ApiError } from '../../../shared/api/client'

/** Como terminou um envio do campo de mensagem. */
export type SendOutcome = 'ok' | 'empty' | 'forbidden' | 'error' | { slowmode: number }

const SEND_FAILED = 'Não foi possível enviar. Tente de novo.'

/** Erro do envio → resultado: 403 sem permissão, 429 do modo lento (com a espera em s). */
export function sendOutcomeOf(err: unknown): SendOutcome {
  if (!(err instanceof ApiError)) return 'error'
  if (err.status === 403) return 'forbidden'
  if (err.code === 'slowmode') return { slowmode: Number(err.body.retry_after) || 1 }
  return 'error'
}

/** Aviso embaixo do campo (null = nada a avisar). O do 403 vem de quem abre o chat. */
export function sendNotice(outcome: SendOutcome, forbiddenNotice?: string): string | null {
  if (outcome === 'ok' || outcome === 'empty') return null
  if (typeof outcome === 'object') return `Modo lento: aguarde ${outcome.slowmode} s para mandar outra mensagem.`
  if (outcome === 'forbidden') return forbiddenNotice ?? SEND_FAILED
  return SEND_FAILED
}
