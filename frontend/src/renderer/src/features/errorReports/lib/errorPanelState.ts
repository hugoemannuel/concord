import { ApiError } from '../../../shared/api/client'
import type { ErrorSource } from '../api/errorReports'

// Aba Erros do painel: filtros, grupo aberto e o estado de cada pedido. Puro.

export interface PanelState {
  source: ErrorSource | ''
  version: string
  /** Impressão digital do grupo aberto (null = a lista). */
  open: string | null
}

export const INITIAL_PANEL: PanelState = { source: '', version: '', open: null }

export type PanelAction =
  | { type: 'source'; source: ErrorSource | '' }
  | { type: 'version'; version: string }
  | { type: 'open'; fingerprint: string }
  | { type: 'close' }

/** Trocar um filtro volta à lista; trocar a origem zera a versão (cada origem tem as suas). */
export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'source':
      return { source: action.source, version: '', open: null }
    case 'version':
      return { ...state, version: action.version, open: null }
    case 'open':
      return { ...state, open: action.fingerprint }
    case 'close':
      return { ...state, open: null }
  }
}

/** As versões do filtro; a escolhida fica na lista mesmo se a resposta nova não a trouxer. */
export function versionOptions(versions: string[], selected: string): string[] {
  return selected === '' || versions.includes(selected) ? versions : [selected, ...versions]
}

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'missing' }
  | { status: 'error' }
  | { status: 'ready'; data: T }

/** Chave do pedido com a tentativa ("tentar de novo" repete); null = não buscar. */
export function attemptKey(key: string | null, attempt: number): string | null {
  return key === null ? null : `${key}#${attempt}`
}

/**
 * O estado guardado só vale para o pedido que o gerou: trocou o período ou um
 * filtro e o pedido novo ainda não voltou, é `loading`, não os dados anteriores.
 */
export function stateForKey<T>(
  entry: { key: string; state: LoadState<T> } | null,
  key: string | null
): LoadState<T> {
  return entry !== null && entry.key === key ? entry.state : { status: 'loading' }
}

/** Falha ao carregar: 403 = não é dev; 404 = o grupo não existe; o resto, erro. */
export function failedLoad(err: unknown): LoadState<never> {
  if (!(err instanceof ApiError)) return { status: 'error' }
  if (err.status === 403) return { status: 'forbidden' }
  return err.status === 404 ? { status: 'missing' } : { status: 'error' }
}
