/** Quanto esperar o iframe carregar antes de oferecer "Tentar de novo". */
export const LOAD_TIMEOUT_MS = 10000

export type PanelStatus = 'loading' | 'loaded' | 'failed'
export interface PanelState {
  /** Vira a `key` do iframe: incrementar remonta. */
  attempt: number
  status: PanelStatus
}
export type PanelAction = 'loaded' | 'timeout' | 'retry'

export const initialPanelState: PanelState = { attempt: 0, status: 'loading' }

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  if (action === 'loaded') return { ...state, status: 'loaded' }
  if (action === 'retry') return { attempt: state.attempt + 1, status: 'loading' }
  return state.status === 'loading' ? { ...state, status: 'failed' } : state
}

/** Agenda o aviso de demora; devolve o cancelamento. */
export function startLoadTimer(onTimeout: () => void): () => void {
  const id = setTimeout(onTimeout, LOAD_TIMEOUT_MS)
  return () => clearTimeout(id)
}
