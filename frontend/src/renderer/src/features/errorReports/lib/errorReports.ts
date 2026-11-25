import type { MainError } from '../../../../../shared/errorReport'
import type { ErrorSink } from '../../../shared/lib/errorSink'
import type { ErrorReport, ErrorReportContext } from '../api/errorReports'
import {
  captureError,
  captureErrorEvent,
  captureRejection,
  type CapturedError
} from './errorCapture'
import { createErrorQueue, ERROR_FLUSH_MS } from './errorQueue'

// O relatório de erros do renderer (docs/adr/0068), sem tocar no navegador
// direto (tudo por deps, para o teste): pega o window.onerror, as promessas
// sem tratamento e as telas de erro (porta shared/lib/errorSink), puxa os
// erros do main do Electron e manda a fila a cada 30 s.

export interface ErrorReportDeps {
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>
  setSink: (sink: ErrorSink | null) => void
  /** Tela atual sem ids (routePattern). */
  screen: () => string
  inCall: () => boolean
  inLive: () => boolean
  /** Conta logada (não visitante). */
  canSend: () => boolean
  context: () => Promise<ErrorReportContext>
  send: (context: ErrorReportContext, errors: ErrorReport[]) => Promise<void>
  /** Erros do main do Electron (undefined na web). */
  takeMain?: () => Promise<MainError[]>
  every: (run: () => void, ms: number) => () => void
}

export function createErrorReports(deps: ErrorReportDeps): { tick: () => Promise<void>; stop: () => void } {
  const queue = createErrorQueue({
    canSend: deps.canSend,
    send: async (errors) => deps.send(await deps.context(), errors)
  })
  const where = (): Pick<ErrorReport, 'in_call' | 'in_live'> => ({ in_call: deps.inCall(), in_live: deps.inLive() })

  // Nunca lança: um erro aqui viraria outro window.onerror.
  const record = (captured: CapturedError | null): void => {
    try {
      if (captured) queue.add({ source: 'renderer', ...captured, screen: deps.screen(), ...where() })
    } catch {
      // o relatório é secundário
    }
  }

  /** O main não sabe a tela; call e live são as de agora (o main avisa em até 30 s). */
  const pullMain = async (): Promise<void> => {
    const errors = await deps.takeMain?.().catch(() => [])
    for (const { count, ...error } of errors ?? []) queue.add({ source: 'main', ...error, screen: '', ...where() }, count)
  }

  const onError = (event: ErrorEvent): void => record(captureErrorEvent(event))
  const onRejection = (event: PromiseRejectionEvent): void => record(captureRejection(event))
  deps.events.addEventListener('error', onError)
  deps.events.addEventListener('unhandledrejection', onRejection)
  deps.setSink((error) => record(captureError(error)))

  const tick = async (): Promise<void> => {
    await pullMain()
    await queue.flush()
  }
  // Erros do main de antes de a janela abrir já entram na fila.
  void pullMain()
  const stopTimer = deps.every(() => void tick(), ERROR_FLUSH_MS)

  return {
    tick,
    stop: () => {
      stopTimer()
      deps.setSink(null)
      deps.events.removeEventListener('error', onError)
      deps.events.removeEventListener('unhandledrejection', onRejection)
    }
  }
}
