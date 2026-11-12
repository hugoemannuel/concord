import { errorMessage } from '../../../shared/lib/errorMessage'
import { isForbiddenError, isGoneError } from './viewOnce'

export type FlowPhase = 'confirm' | 'loading' | 'open' | 'closed' | 'gone' | 'failed' | 'forbidden'

export interface FlowState {
  phase: FlowPhase
  /** Só existe com a mídia aberta; solta ao fechar. */
  src: string | null
  /** O erro da abertura, só na fase `failed` (vira o aviso). */
  error?: unknown
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
  /** Desmontar: solta a proteção e o src sem relatar resultado (StrictMode monta duas vezes). */
  dispose(): void
  onKey(key: string): void
}

function failurePhase(err: unknown): FlowPhase {
  if (isGoneError(err)) return 'gone'
  return isForbiddenError(err) ? 'forbidden' : 'failed'
}

const ENDED: FlowPhase[] = ['closed', 'gone', 'failed', 'forbidden']

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
  let disposed = false
  const now = (): FlowPhase => phase
  const set = (p: FlowPhase, src: string | null = null, error?: unknown): void => {
    if (disposed) return
    phase = p
    onChange(p === 'failed' ? { phase: p, src, error } : { phase: p, src })
  }
  const unprotect = (): void => {
    if (!protecting) return
    protecting = false
    deps.protect(false)
  }
  const finish = (p: FlowPhase, error?: unknown): void => {
    unprotect()
    set(p, null, error)
  }
  const close = (): void => {
    if (ENDED.includes(phase)) return
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
        if (now() === 'loading') finish(failurePhase(err), err)
      }
    },
    cancel() {
      if (phase === 'confirm') finish('closed')
    },
    close,
    dispose() {
      unprotect()
      disposed = true
      phase = 'closed'
    },
    onKey(key) {
      if (key === 'Escape') close()
    }
  }
}

export type FlowOutcome = 'seen' | 'gone' | 'cancelled' | 'failed' | 'forbidden'

/** O resultado que a mensagem precisa saber quando o fluxo termina (null enquanto segue). */
export function flowOutcome(s: FlowState, opened: boolean): FlowOutcome | null {
  if (s.phase === 'gone' || s.phase === 'failed' || s.phase === 'forbidden') return s.phase
  if (s.phase === 'closed') return opened ? 'seen' : 'cancelled'
  return null
}

export type ViewerOutcome = Exclude<FlowOutcome, 'failed'>

/** O que a mensagem recebe e o aviso a mostrar: falha vira cancelado com o aviso padrão do app. */
export function viewerResult(
  o: FlowOutcome,
  err: unknown
): { outcome: ViewerOutcome; toast: string | null } {
  if (o !== 'failed') return { outcome: o, toast: null }
  return { outcome: 'cancelled', toast: errorMessage(err, 'Sem conexão com o servidor') }
}
