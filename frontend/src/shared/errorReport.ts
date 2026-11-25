// Erro do processo main do Electron guardado para o renderer mandar
// (docs/adr/0068): o main não tem login; o renderer puxa pela ponte
// window.api.errorReport e manda com a conta dele. Já sai limpo do main.

export interface MainError {
  /** "TypeError", "render-process-gone", "helper-exit"... */
  kind: string
  message: string
  stack: string
  /** Quantas vezes aconteceu desde o último take (1 a 10 000). */
  count: number
}

/** Canal do IPC: o renderer pede e o main devolve e esvazia a fila. */
export const ERROR_REPORT_TAKE = 'error-report:take'
