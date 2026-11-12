import { isGoneError } from './viewOnce'

export type FlowPhase = 'confirm' | 'loading' | 'open' | 'closed' | 'gone' | 'failed'

export interface FlowState {
  phase: FlowPhase
  /** Só existe com a mídia aberta; solta ao fechar. */
  src: string | null
}

export interface FlowDeps {
  open(attachmentId: string): Promise<{ token: string }>
  src(attachmentId: string, token: string): string
  /** Liga/desliga a proteção contra print (só existe no desktop). */
  protect(on: boolean): void
}

export interface ViewOnceFlow {
  confirm(): Promise<void>
  cancel(): void
  close(): void
  onKey(key: string): void
}

/**
 * Fluxo do visualizador: confirmar → abrir → proteção ligada → fechar → proteção
 * desligada. Cancelar não abre nada; toda saída desliga a proteção e solta o src.
 */
export function createViewOnceFlow(
  attachmentId: string,
  deps: FlowDeps,
  onChange: (s: FlowState) => void
): ViewOnceFlow {
  let phase: FlowPhase = 'confirm'
  let protecting = false
  const now = (): FlowPhase => phase
  const set = (p: FlowPhase, src: string | null = null): void => {
    phase = p
    onChange({ phase: p, src })
  }
  const finish = (p: FlowPhase): void => {
    if (protecting) {
      protecting = false
      deps.protect(false)
    }
    set(p)
  }
  const close = (): void => {
    if (phase === 'closed' || phase === 'gone' || phase === 'failed') return
    finish('closed')
  }
  return {
    async confirm() {
      if (phase !== 'confirm') return
      set('loading')
      protecting = true
      deps.protect(true)
      try {
        const { token } = await deps.open(attachmentId)
        if (now() !== 'loading') return
        set('open', deps.src(attachmentId, token))
      } catch (err) {
        if (now() === 'loading') finish(isGoneError(err) ? 'gone' : 'failed')
      }
    },
    cancel() {
      if (phase === 'confirm') finish('closed')
    },
    close,
    onKey(key) {
      if (key === 'Escape') close()
    }
  }
}

export type FlowOutcome = 'seen' | 'gone' | 'cancelled' | 'failed'

/** O resultado que a mensagem precisa saber quando o fluxo termina (null enquanto segue). */
export function flowOutcome(s: FlowState, opened: boolean): FlowOutcome | null {
  if (s.phase === 'gone' || s.phase === 'failed') return s.phase
  if (s.phase === 'closed') return opened ? 'seen' : 'cancelled'
  return null
}
