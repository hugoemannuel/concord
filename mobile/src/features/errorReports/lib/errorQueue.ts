import type { CapturedError } from './errorCapture'

/** Um item do POST /api/obs/errors (contrato do plano do ADR 0068). */
export interface ErrorReport extends CapturedError {
  source: 'mobile'
  screen: string
  in_call: boolean
  in_live: boolean
  count: number
}

export type ReportInput = Omit<ErrorReport, 'source' | 'count'>

export interface QueueTimer {
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

export interface ErrorQueueOptions {
  /** Manda um lote; rejeitar = os erros voltam para a fila. */
  send: (batch: ErrorReport[]) => Promise<void>
  /** Há conta logada (visitante/sem login não manda: segura na fila). */
  canSend: () => boolean
  timer?: QueueTimer
  intervalMs?: number
  batchSize?: number
  maxKeys?: number
}

export interface ErrorQueue {
  add: (input: ReportInput) => void
  /** Manda o próximo lote agora; um envio por vez (quem chama durante um envio espera o mesmo). */
  flush: () => Promise<void>
  start: () => void
  stop: () => void
  size: () => number
}

const MAX_COUNT = 10_000
const defaultTimer: QueueTimer = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>)
}

const FRAME = /^\s*at\s|@\S*:\d+/

/** Chave do dedup no aparelho: tipo + mensagem + 1º quadro da pilha. */
export function reportKey(input: Pick<ReportInput, 'kind' | 'message' | 'stack'>): string {
  const frame = input.stack.split('\n').find((line) => FRAME.test(line)) ?? ''
  return `${input.kind}\0${input.message}\0${frame.trim()}`
}

/** Fila do relatório: dedup com contagem, 50 chaves por sessão, lote de 10 a cada 30 s. */
export function createErrorQueue(options: ErrorQueueOptions): ErrorQueue {
  const { send, canSend, timer = defaultTimer, intervalMs = 30_000, batchSize = 10, maxKeys = 50 } = options
  const pending = new Map<string, ErrorReport>()
  const seen = new Set<string>()
  let inflight: Promise<void> | null = null
  let interval: unknown = null

  const merge = (key: string, report: ErrorReport): void => {
    const current = pending.get(key)
    if (current) current.count = Math.min(MAX_COUNT, current.count + report.count)
    else pending.set(key, report)
  }

  const add = (input: ReportInput): void => {
    const key = reportKey(input)
    if (!seen.has(key) && seen.size >= maxKeys) return
    seen.add(key)
    merge(key, { ...input, source: 'mobile', count: 1 })
  }

  const sendBatch = async (): Promise<void> => {
    const batch = [...pending.entries()].slice(0, batchSize)
    batch.forEach(([key]) => pending.delete(key))
    try {
      await send(batch.map(([, report]) => report))
    } catch {
      batch.forEach(([key, report]) => merge(key, report))
    }
  }

  const flush = (): Promise<void> => {
    if (inflight) return inflight
    if (pending.size === 0 || !canSend()) return Promise.resolve()
    inflight = sendBatch().finally(() => {
      inflight = null
    })
    return inflight
  }

  return {
    add,
    flush,
    start: () => {
      interval ??= timer.setInterval(() => void flush(), intervalMs)
    },
    stop: () => {
      if (interval !== null) timer.clearInterval(interval)
      interval = null
    },
    size: () => pending.size
  }
}
