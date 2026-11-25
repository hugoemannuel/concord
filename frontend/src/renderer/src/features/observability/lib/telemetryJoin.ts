import type { CallConnection, CallJoinStep } from '../../call/lib/callConnection'
import type { TelemetryEvent } from './telemetryTypes'

// Telemetria da entrada na call (docs/adr/0032, emenda de 2026-11-25): em que
// etapa a entrada demora (acesso = nosso servidor; sinal = Caddy/WebSocket do
// LiveKit; mídia = UDP/ICE) e quantas tentativas a pessoa refaz ou desiste.
// Lê as mesmas mudanças de fase que telemetryConnection, sem tocar no callStore.

/** Entrada acima disso vira "entrada lenta", com o tempo de cada etapa. */
export const SLOW_JOIN_MS = 3000

export const STEPS: Record<CallJoinStep, string> = { token: 'acesso', signal: 'sinal', media: 'mídia' }
const ORDER: CallJoinStep[] = ['token', 'signal', 'media']

export const seconds = (ms: number): string =>
  `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`

/** Quando cada etapa da entrada atual começou. */
type Starts = Partial<Record<CallJoinStep, number>>

/** "acesso 0,2 s · sinal 0,4 s · mídia 4,1 s": cada etapa até a seguinte (a última, até conectar). */
export function stepTimes(starts: Starts, end: number): string {
  const seen = ORDER.filter((step) => starts[step] !== undefined)
  return seen
    .map((step, i) => {
      const until = i + 1 < seen.length ? starts[seen[i + 1]]! : end
      return `${STEPS[step]} ${seconds(until - starts[step]!)}`
    })
    .join(' · ')
}

function abandoned(why: string, prev: CallConnection, now: number): TelemetryEvent {
  const step = prev.step ? STEPS[prev.step] : '—'
  return { type: 'entrada_abandonada', detail: `${why} · ${step} · ${seconds(now - prev.since)}` }
}

/** Mesma entrada em andamento (só a etapa pode mudar). */
const sameAttempt = (prev: CallConnection, next: CallConnection): boolean =>
  prev.phase === 'connecting' && next.phase === 'connecting' && prev.since === next.since

/**
 * Acompanha as entradas: devolve `entrada_lenta` ao conectar devagar e
 * `entrada_abandonada` numa nova tentativa ou saída durante a entrada (a falha
 * já é `conexao_falhou`).
 */
export function createJoinTracker(): (
  prev: CallConnection,
  next: CallConnection,
  now: number
) => TelemetryEvent | null {
  let starts: Starts = {}

  function connecting(prev: CallConnection, next: CallConnection, now: number): TelemetryEvent | null {
    if (sameAttempt(prev, next)) {
      if (next.step && starts[next.step] === undefined) starts[next.step] = now
      return null
    }
    starts = { [next.step ?? 'token']: next.since }
    return prev.phase === 'connecting' ? abandoned('nova tentativa', prev, now) : null
  }

  function left(prev: CallConnection, next: CallConnection, now: number): TelemetryEvent | null {
    const steps = starts
    starts = {}
    if (next.phase === 'idle') return abandoned('saiu', prev, now)
    const total = next.since - prev.since
    if (next.phase !== 'connected' || total <= SLOW_JOIN_MS) return null
    return { type: 'entrada_lenta', detail: stepTimes(steps, next.since) }
  }

  return (prev, next, now) => {
    if (next.phase === 'connecting') return connecting(prev, next, now)
    return prev.phase === 'connecting' ? left(prev, next, now) : null
  }
}
