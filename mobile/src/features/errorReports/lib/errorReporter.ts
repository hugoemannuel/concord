import { captureError, isExpected } from './errorCapture'
import type { ReportInput } from './errorQueue'

/** O que o app estava fazendo na hora: padrão da tela, em chamada, em live. */
export type ReportContext = Pick<ReportInput, 'screen' | 'in_call' | 'in_live'>

export interface ErrorReporterDeps {
  add: (input: ReportInput) => void
  context: () => ReportContext
}

export interface ErrorReporter {
  /** Leva o erro à fila, já limpo; erro esperado (rede) fica de fora. Nunca lança. */
  record: (error: unknown) => void
}

export function createErrorReporter({ add, context }: ErrorReporterDeps): ErrorReporter {
  return {
    record: (error) => {
      try {
        if (!isExpected(error)) add({ ...captureError(error), ...context() })
      } catch {
        // O relatório não pode virar um segundo erro.
      }
    }
  }
}
