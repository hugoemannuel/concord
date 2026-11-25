import { scrubMessage, scrubStack } from '../../../../../shared/errorScrub'
import { ApiError } from '../../../shared/api/client'

// Do que o navegador entrega (um valor lançado qualquer, o ErrorEvent do
// window.onerror ou o PromiseRejectionEvent) ao erro do relatório, já limpo
// (docs/adr/0068). O filtro decide antes da limpeza: a pilha crua é que diz se
// o erro veio de uma extensão.

export interface CapturedError {
  kind: string
  message: string
  stack: string
}

interface ErrorEventLike {
  error?: unknown
  message?: string
  filename?: string
  lineno?: number
  colno?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Valor lançado → tipo, mensagem e pilha crus. Lançar uma string vira "NonError". */
export function rawError(value: unknown): CapturedError {
  if (value instanceof Error || (isRecord(value) && typeof value.message === 'string')) {
    const error = value as { name?: unknown; message: string; stack?: unknown }
    return { kind: text(error.name) || 'Error', message: error.message, stack: text(error.stack) }
  }
  return { kind: 'NonError', message: String(value), stack: '' }
}

/** ErrorEvent sem o objeto do erro (script de outra origem): só o lugar. */
export function rawFromErrorEvent(event: ErrorEventLike): CapturedError {
  if (event.error !== undefined && event.error !== null) return rawError(event.error)
  const where = event.filename ? `    at ${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}` : ''
  return { kind: 'Error', message: event.message ?? '', stack: where }
}

// Rede e carregamento: o fetch que falhou, o offline, o chunk do Vite que não
// baixou (deploy novo com o app aberto) não são bug do app; o 5xx da API já é
// visto pelo lado do servidor. ResizeObserver loop é aviso benigno do
// navegador. "Script error." é o erro de um script de outra origem, sem
// mensagem nem pilha: nada a corrigir.
const EXPECTED_MESSAGE =
  /Failed to fetch|NetworkError|Load failed|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ResizeObserver loop|^Script error\.?$/i

// Pilha que começa numa extensão do navegador: o código não é nosso.
const EXTENSION_FRAME = /(?:chrome|moz|safari(?:-web)?)-extension:\/\//

/** Primeiro quadro da pilha: "at …" no V8; "função@arquivo" no Firefox e no Safari. */
export function firstFrame(stack: string): string {
  const lines = stack.split('\n')
  const frame = lines.find((line) => /^\s*at\s/.test(line)) ?? lines.find((line) => line.includes('@'))
  return frame?.trim() ?? ''
}

/** Resposta de rota do react-router (404 etc.): não é erro do código. */
function isRouteResponse(value: unknown): boolean {
  return isRecord(value) && typeof value.status === 'number' && typeof value.statusText === 'string'
}

/** Erro que não vai para o relatório (lista do plano, docs/adr/0068). */
export function isExpected(value: unknown, raw: CapturedError): boolean {
  if (value instanceof ApiError || isRouteResponse(value)) return true
  if (raw.kind === 'AbortError' || EXPECTED_MESSAGE.test(raw.message)) return true
  return EXTENSION_FRAME.test(firstFrame(raw.stack))
}

function scrubbed(raw: CapturedError): CapturedError {
  return {
    kind: scrubMessage(raw.kind).slice(0, 64) || 'Error',
    message: scrubMessage(raw.message),
    stack: scrubStack(raw.stack)
  }
}

/** Valor lançado → erro limpo, ou null quando é esperado. */
export function captureError(value: unknown): CapturedError | null {
  const raw = rawError(value)
  return isExpected(value, raw) ? null : scrubbed(raw)
}

export function captureErrorEvent(event: ErrorEventLike): CapturedError | null {
  const raw = rawFromErrorEvent(event)
  return isExpected(event.error, raw) ? null : scrubbed(raw)
}

export function captureRejection(event: { reason?: unknown }): CapturedError | null {
  return captureError(event.reason)
}
