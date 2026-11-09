// Modo lento do canal (issue #586): cada membro manda uma mensagem a cada
// `slowmode_seconds`. Quem tem Gerenciar mensagens ou Gerenciar canais fica
// isento. O servidor é quem barra (429 "slowmode"); aqui só os textos e contas.
import { ApiError } from '../../../shared/api/client'
import type { PendingMessage } from './pendingMessages'

/** Os intervalos aceitos pelo servidor (os do Discord); 0 = desligado. */
const SLOWMODE_VALUES = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600]

/** "30 s", "2 min", "6 h". */
export function slowmodeLabel(seconds: number): string {
  if (seconds >= 3600) return `${seconds / 3600} h`
  if (seconds >= 60) return `${seconds / 60} min`
  return `${seconds} s`
}

/** Opções do seletor "Modo lento" (Editar canal). */
export const SLOWMODE_OPTIONS = SLOWMODE_VALUES.map((value) => ({
  value,
  label: value === 0 ? 'Desligado' : slowmodeLabel(value)
}))

const two = (n: number): string => String(n).padStart(2, '0')

/** Espera como relógio: "0:12", "1:05", "1:00:00". */
export function formatWait(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}

export interface SlowmodeState {
  /** Intervalo do canal (0 = desligado). */
  seconds: number
  /** Gerenciar mensagens ou Gerenciar canais no canal. */
  exempt: boolean
  /** Segundos até poder mandar de novo (0 = já pode). */
  remaining: number
}

/** Texto da faixa acima do campo de mensagem (null = sem faixa). */
export function slowmodeBarText(state: SlowmodeState): string | null {
  if (state.seconds <= 0) return null
  if (state.exempt) return 'Modo lento ativado (você está isento)'
  if (state.remaining > 0) return `Modo lento: aguarde ${formatWait(state.remaining)}`
  return `Modo lento: 1 mensagem a cada ${slowmodeLabel(state.seconds)}`
}

/** O que o campo de mensagem mostra e se o envio está travado. */
export function slowmodeView(state: SlowmodeState): { text: string | null; blocked: boolean } {
  return {
    text: slowmodeBarText(state),
    blocked: state.seconds > 0 && !state.exempt && state.remaining > 0
  }
}

/** Segundos inteiros (para cima) até `until`, em ms desde a época. */
export function remainingSeconds(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000))
}

/** Aviso quando o servidor recusa a mensagem pelo modo lento. */
export function slowmodeErrorText(retryAfter: number): string {
  return `Modo lento: aguarde ${retryAfter} s para mandar outra mensagem.`
}

/** Segundos de espera do 429 de modo lento (null = não é esse erro). */
export function slowmodeRetryAfter(err: unknown): number | null {
  if (!(err instanceof ApiError) || err.code !== 'slowmode') return null
  return Number(err.body.retry_after) || 1
}

/** "/tts ..." vira mensagem; os outros comandos (Maestro) não, e não contam. */
const isNonMessageCommand = (text: string): boolean => text.startsWith('/') && !/^\/tts(\s|$)/i.test(text)

/**
 * Depois de um envio sem erro, a vez conta? Não conta sem modo lento, para
 * quem é isento, em comando que não vira mensagem nem quando o envio caiu na
 * rede (a bolha ficou "Não enviada" e o servidor não gastou a vez).
 */
export function shouldLockAfterSend(input: {
  seconds: number
  exempt: boolean
  /** Texto enviado ('' para figurinha, GIF e áudio). */
  text: string
  /** Bolhas locais da sala logo depois do envio. */
  pending: PendingMessage[]
}): boolean {
  if (input.seconds <= 0 || input.exempt) return false
  const text = input.text.trim()
  if (isNonMessageCommand(text)) return false
  return !input.pending.some((p) => p.status === 'failed' && p.content === text)
}
