import type { MainError } from '../../shared/errorReport'
import { scrubMessage, scrubStack } from '../../shared/errorScrub'

// Fila dos erros do processo main (docs/adr/0068): em memória, até 20 erros
// distintos com a contagem, já limpos. O renderer puxa (error-report:take) e
// manda com a conta dele; erro de antes de a janela abrir espera aqui. Sem
// Electron neste arquivo: os helpers (concord-live, concord-audio, overlay)
// avisam daqui mesmo, e os testes deles não precisam de nada.

export const MAX_MAIN_ERRORS = 20
const MAX_COUNT = 10_000

export interface MainErrorQueue {
  add(kind: string, message: string, stack?: string): void
  /** Devolve e esvazia. */
  take(): MainError[]
}

export function createMainErrorQueue(limit = MAX_MAIN_ERRORS): MainErrorQueue {
  const queued = new Map<string, MainError>()
  return {
    add(kind, message, stack = '') {
      const error = { kind: scrubMessage(kind) || 'Error', message: scrubMessage(message), stack: scrubStack(stack) }
      const key = [error.kind, error.message, error.stack.split('\n')[1] ?? ''].join('\u0000')
      const entry = queued.get(key)
      if (entry) entry.count = Math.min(MAX_COUNT, entry.count + 1)
      else if (queued.size < limit) queued.set(key, { ...error, count: 1 })
    },
    take() {
      const errors = [...queued.values()]
      queued.clear()
      return errors
    }
  }
}

/** A fila do processo (uma só: o main é um processo). */
export const mainErrors = createMainErrorQueue()

/** Valor lançado no main → tipo, mensagem e pilha. */
export function describeThrown(value: unknown): { kind: string; message: string; stack: string } {
  if (value instanceof Error) return { kind: value.name || 'Error', message: value.message, stack: value.stack ?? '' }
  return { kind: 'NonError', message: String(value), stack: '' }
}

// Rede do main (atualização, servidor fora, sem internet): não é bug do app,
// como no renderer (features/errorReports/lib/errorCapture.ts).
const EXPECTED_NETWORK = /net::ERR_|\b(?:ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH)\b/

/** Nunca lança: o relatório não pode derrubar o app. */
export function reportMainError(value: unknown): void {
  try {
    const { kind, message, stack } = describeThrown(value)
    if (!EXPECTED_NETWORK.test(message)) mainErrors.add(kind, message, stack)
  } catch {
    // o relatório é secundário
  }
}

/** "concord-live saiu (código 3)" / "(sinal SIGKILL)". */
export function helperExitMessage(name: string, code: number | null, signal: string | null): string {
  const how = signal ? `sinal ${signal}` : `código ${code ?? '?'}`
  return `${name} saiu sem avisar (${how})`
}

/** Saída INESPERADA de um helper nativo (quem chama já sabe que não foi pedida). */
export function reportHelperExit(name: string, code: number | null, signal: string | null = null): void {
  mainErrors.add('helper-exit', helperExitMessage(name, code, signal))
}

/** O que o Electron conta de um processo que acabou (render-process-gone / child-process-gone). */
export interface GoneDetails {
  reason: string
  exitCode: number
  /** child-process-gone: "GPU", "Utility"... */
  type?: string
  /** child-process-gone: nome do serviço do processo utilitário. */
  name?: string
}

/** Saída normal não é erro. */
export function isCleanExit(details: GoneDetails): boolean {
  return details.reason === 'clean-exit'
}

/** "renderer crashed (código 1)", "GPU oom (código -5)", "Utility Audio Service killed (código 9)". */
export function processGoneMessage(details: GoneDetails): string {
  const process = [details.type ?? 'renderer', details.name].filter(Boolean).join(' ')
  return `${process} ${details.reason} (código ${details.exitCode})`
}
