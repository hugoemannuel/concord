// Gravação da organização dos canais: um pedido por vez. Cada pedido traz a
// lista inteira, então, do que chegar enquanto um está no ar, só o último sai.

interface LayoutSaveDeps<W> {
  send: (write: W) => Promise<void>
  /** Terminou tudo e nada falhou. */
  onIdle: () => void
  /** O servidor recusou: o que esperava na fila foi descartado. */
  onFailed: (err: unknown) => void
}

export interface LayoutSaveQueue<W> {
  submit: (write: W) => void
  busy: () => boolean
}

export function createLayoutSaveQueue<W>({ send, onIdle, onFailed }: LayoutSaveDeps<W>): LayoutSaveQueue<W> {
  let inFlight = false
  let waiting: { write: W } | null = null
  const run = (write: W): void => {
    inFlight = true
    send(write).then(
      () => {
        const next = waiting
        waiting = null
        if (next) return run(next.write)
        inFlight = false
        onIdle()
      },
      (err: unknown) => {
        waiting = null
        inFlight = false
        onFailed(err)
      }
    )
  }
  return {
    submit: (write) => {
      if (inFlight) waiting = { write }
      else run(write)
    },
    busy: () => inFlight
  }
}

/** O aviso quando o servidor recusa: 409 é outra pessoa mexendo ao mesmo tempo. */
export function layoutSaveErrorText(err: unknown): string {
  return (err as { status?: number } | null)?.status === 409
    ? 'A lista de canais mudou enquanto você organizava. Confira e tente de novo.'
    : 'Não foi possível salvar a organização dos canais.'
}
