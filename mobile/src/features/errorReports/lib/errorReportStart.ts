import { ApiError } from '../../../shared/api/client'
import { setErrorSink } from '../../../shared/lib/errorSink'
import { useAuthStore } from '../../auth/store/authStore'
import { isInCall, useCallSessionStore } from '../../call/store/callSessionStore'
import { useScreenShareStore } from '../../call/store/screenShareStore'
import { postErrors } from '../api/errorReports'
import { createErrorQueue, type ErrorReport, type QueueTimer } from './errorQueue'
import { createErrorReporter, type ReportContext } from './errorReporter'
import { installGlobalHandler, installRejectionTracker, type ErrorUtilsLike, type RejectionTrackerHost } from './globalErrorHandlers'

/** Quanto o fatal espera o envio antes de deixar o RN fechar o app. */
const FATAL_WAIT_MS = 2_000

export interface StartDeps {
  errorUtils: ErrorUtilsLike | undefined
  hermes: RejectionTrackerHost | null | undefined
  isDev: boolean
  /** Há conta logada: sem conta, a fila segura (com o teto de 50 chaves). */
  canSend: () => boolean
  callContext: () => Pick<ReportContext, 'in_call' | 'in_live'>
  post: (batch: ErrorReport[]) => Promise<void>
  timer?: QueueTimer
}

let screen = '/'
let stopQueue: (() => void) | null = null

/** A tela atual pelo padrão da rota (ErrorReportBridge); vai em cada erro registrado. */
export function setErrorScreen(pattern: string): void {
  screen = pattern
}

/** Só leitura dos stores da chamada: em chamada (não conta tocando) e em live (transmitindo ou assistindo). */
export function callContext(): Pick<ReportContext, 'in_call' | 'in_live'> {
  const share = useScreenShareStore.getState()
  return { in_call: isInCall(useCallSessionStore.getState()), in_live: share.sharing || share.watching !== null }
}

// 4xx que não é login (401) nem limite (429): mandar de novo dá o mesmo erro, então o lote sai da fila.
const isPermanent = (err: unknown): boolean =>
  err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429

/** Manda o lote; rejeita (o lote volta para a fila) só quando tentar de novo pode dar certo. */
export async function sendReports(batch: ErrorReport[], post: StartDeps['post'] = postErrors): Promise<void> {
  try {
    await post(batch)
  } catch (err) {
    if (!isPermanent(err)) throw err
  }
}

function waitAtMost(work: Promise<void>, ms: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<void>((resolve) => (timeout = setTimeout(resolve, ms)))
  return Promise.race([work, limit]).finally(() => clearTimeout(timeout))
}

const globals = globalThis as { ErrorUtils?: ErrorUtilsLike; HermesInternal?: RejectionTrackerHost | null }

function defaultDeps(): StartDeps {
  return {
    errorUtils: globals.ErrorUtils,
    hermes: globals.HermesInternal,
    isDev: __DEV__,
    canSend: () => useAuthStore.getState().status === 'signedIn',
    callContext,
    post: postErrors
  }
}

/**
 * Liga o relatório de erros (ADR 0068): o destino da porta do ErrorBoundary, o handler
 * global do RN e o rastreador de promessas do Hermes, e o envio a cada 30 s. Uma vez
 * por processo (devolve false se já estava ligado).
 */
export function startErrorReports(overrides: Partial<StartDeps> = {}): boolean {
  if (stopQueue) return false
  const deps = { ...defaultDeps(), ...overrides }
  const queue = createErrorQueue({ send: (batch) => sendReports(batch, deps.post), canSend: deps.canSend, timer: deps.timer })
  const reporter = createErrorReporter({ add: queue.add, context: () => ({ screen, ...deps.callContext() }) })
  setErrorSink((error) => reporter.record(error))
  installGlobalHandler(deps.errorUtils, {
    record: reporter.record,
    // No dev o fatal não fecha o app (RedBox): o envio de 30 s leva o erro.
    flushFatal: () => (deps.isDev ? Promise.resolve() : waitAtMost(queue.flush(), FATAL_WAIT_MS))
  })
  installRejectionTracker(deps.hermes, reporter.record, deps.isDev)
  queue.start()
  stopQueue = queue.stop
  return true
}

/** Para o envio e solta a porta (testes). O handler global encadeado fica: o RN não tem como desfazer. */
export function stopErrorReports(): void {
  stopQueue?.()
  stopQueue = null
  setErrorSink(null)
}
