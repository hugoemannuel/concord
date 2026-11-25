import { ApiError } from '../../../shared/api/client'
import type { ErrorReport } from '../api/errorReports'
import { firstFrame } from './errorCapture'

// Fila do relatório de erros no aparelho (limites do docs/adr/0068): o mesmo
// erro (origem + tipo + mensagem + 1º quadro) só soma a contagem; até 50 erros
// distintos por sessão do app (um laço que gera erros diferentes não lota o
// servidor; o resto é descartado); a cada envio, até 10 erros e até ~30 KB
// (o servidor recusa corpo acima de 32 KB). O que não foi entregue fica para o
// próximo envio, e a fila nunca passa do teto. Sem conta (visitante ou sem
// login) não manda: guarda até ter. Se o servidor recusar a conta (401, ou 403
// do visitante), espera 5 min antes de tentar de novo (sem laço de reenvio).

export const ERROR_FLUSH_MS = 30_000
export const MAX_KEYS_PER_SESSION = 50
export const MAX_PER_SEND = 10
export const MAX_SEND_BYTES = 30_000
export const MAX_COUNT = 10_000
export const REJECTED_PAUSE_MS = 5 * 60_000

export type QueuedError = Omit<ErrorReport, 'count'>

export interface ErrorQueueDeps {
  send: (errors: ErrorReport[]) => Promise<void>
  /** Há uma conta logada (não visitante)? */
  canSend: () => boolean
  now?: () => number
}

export interface ErrorQueue {
  add(error: QueuedError, count?: number): void
  /** Manda o próximo lote; não faz nada se já houver um envio em andamento. */
  flush(): Promise<void>
  /** Quantos erros distintos esperam envio. */
  pending(): number
}

export function errorKey(error: QueuedError): string {
  return [error.source, error.kind, error.message, firstFrame(error.stack)].join('\u0000')
}

const encoder = new TextEncoder()
const size = (value: unknown): number => encoder.encode(JSON.stringify(value)).length

/** Os primeiros da fila que cabem no envio (pelo menos um: cada erro já tem ≤ ~4,5 KB). */
export function takeBatch(entries: ErrorReport[]): ErrorReport[] {
  const batch: ErrorReport[] = []
  let bytes = 2
  for (const entry of entries.slice(0, MAX_PER_SEND)) {
    bytes += size(entry) + 1
    if (batch.length > 0 && bytes > MAX_SEND_BYTES) break
    batch.push(entry)
  }
  return batch
}

const statusOf = (error: unknown): number => (error instanceof ApiError ? error.status : 0)

/** Pedido inválido (400/413) não melhora se repetir: o lote é descartado. */
const isPermanent = (error: unknown): boolean => [400, 413].includes(statusOf(error))

/** A conta foi recusada (401; 403 do visitante): guarda e dá um tempo. */
const isRejected = (error: unknown): boolean => [401, 403].includes(statusOf(error))

export function createErrorQueue(deps: ErrorQueueDeps): ErrorQueue {
  const seen = new Set<string>()
  const queued = new Map<string, ErrorReport>()
  const now = deps.now ?? Date.now
  let sending = false
  let pausedUntil = 0

  const add = (error: QueuedError, count = 1): void => {
    const key = errorKey(error)
    if (!seen.has(key) && seen.size >= MAX_KEYS_PER_SESSION) return
    seen.add(key)
    const entry = queued.get(key)
    if (entry) entry.count = Math.min(MAX_COUNT, entry.count + count)
    else queued.set(key, { ...error, count: Math.min(MAX_COUNT, Math.max(1, count)) })
  }

  /** Entregue: tira o que foi mandado (o que chegou durante o envio fica). */
  const settle = (batch: ErrorReport[]): void => {
    for (const sent of batch) {
      const key = errorKey(sent)
      const entry = queued.get(key)
      if (!entry) continue
      entry.count -= sent.count
      if (entry.count <= 0) queued.delete(key)
    }
  }

  const flush = async (): Promise<void> => {
    if (sending || queued.size === 0 || now() < pausedUntil || !deps.canSend()) return
    const batch = takeBatch([...queued.values()]).map((entry) => ({ ...entry }))
    sending = true
    try {
      await deps.send(batch)
      settle(batch)
    } catch (error) {
      if (isPermanent(error)) settle(batch)
      if (isRejected(error)) pausedUntil = now() + REJECTED_PAUSE_MS
    } finally {
      sending = false
    }
  }

  return { add, flush, pending: () => queued.size }
}
