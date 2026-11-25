import { ApiError } from '../../../shared/api/client'
import { scrubMessage, scrubStack } from './errorScrub'

/** O erro pronto para sair: tipo, mensagem e pilha já limpos (ADR 0068). */
export interface CapturedError {
  kind: string
  message: string
  stack: string
}

interface ErrorLike {
  name?: unknown
  message: string
  stack?: unknown
}

const MAX_KIND = 64

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === 'object' && value !== null && typeof (value as ErrorLike).message === 'string'
}

function kindOf(name: unknown): string {
  const text = typeof name === 'string' ? name.replace(/[^\w$.]/g, '') : ''
  return text.slice(0, MAX_KIND) || 'Error'
}

/** Qualquer coisa lançada → erro limpo. De um não-erro só sai o texto (se for texto) ou o tipo. */
export function captureError(error: unknown): CapturedError {
  if (isErrorLike(error)) {
    const stack = typeof error.stack === 'string' ? error.stack : ''
    return { kind: kindOf(error.name), message: scrubMessage(error.message), stack: scrubStack(stack) }
  }
  const message = typeof error === 'string' ? error : Object.prototype.toString.call(error)
  return { kind: 'NonError', message: scrubMessage(message), stack: '' }
}

// Rede e servidor fora não são bug do app: o 5xx já aparece no servidor.
const NETWORK = /Network request failed|Failed to fetch|NetworkError|Load failed|Request timed out|\boffline\b/i

/** Erro esperado (rede, offline, AbortError, ApiError do client): não vai ao relatório. */
export function isExpected(error: unknown): boolean {
  if (error instanceof ApiError) return true
  if (typeof error === 'string') return NETWORK.test(error)
  if (!isErrorLike(error)) return false
  return error.name === 'AbortError' || NETWORK.test(error.message)
}
