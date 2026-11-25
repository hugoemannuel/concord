// Porta do relatório de erros (docs/adr/0068): as telas de erro de shared/ui
// avisam aqui sem conhecer quem manda (features/errorReports liga o destino
// ao iniciar). Sem destino ligado, não faz nada.

/** Onde o erro foi pego: no AppErrorBoundary ('tela') ou no errorElement do router ('rota'). */
export type ErrorWhere = 'tela' | 'rota'

export type ErrorSink = (error: unknown, where: ErrorWhere) => void

let sink: ErrorSink | null = null

export function setErrorSink(next: ErrorSink | null): void {
  sink = next
}

/** Nunca lança: a tela de erro aparece mesmo se o relatório quebrar. */
export function reportAppError(error: unknown, where: ErrorWhere): void {
  try {
    sink?.(error, where)
  } catch {
    // o relatório é secundário
  }
}
