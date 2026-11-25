// Porta do relatório de erros: shared não importa de features, então quem pega o
// erro (o ErrorBoundary) avisa por aqui e features/errorReports liga o destino no boot.
// Até ligar, reportar não faz nada.

/** Onde o erro foi pego: 'tela' = o ErrorBoundary (erro de renderização). */
export type ErrorWhere = 'tela'

export type ErrorSink = (error: unknown, where: ErrorWhere) => void

let sink: ErrorSink | null = null

export function setErrorSink(next: ErrorSink | null): void {
  sink = next
}

/** Repassa o erro ao relatório; nunca lança (o relatório não pode derrubar quem reporta). */
export function reportAppError(error: unknown, where: ErrorWhere): void {
  try {
    sink?.(error, where)
  } catch {
    // O relatório falhou: o erro original segue o caminho normal de quem chamou.
  }
}
