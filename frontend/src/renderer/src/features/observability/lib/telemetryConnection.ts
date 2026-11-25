import type { CallConnection, CallJoinStep } from '../../call/lib/callConnection'
import type { TelemetryEvent } from './telemetryTypes'

// Telemetria da conexão da voz (docs/adr/0032): quanto demorou para entrar,
// quando caiu e voltou, e em que etapa não conectou — para saber se é o
// servidor (todo mundo ao mesmo tempo, ex.: LIVEKIT_NODE_IP errado) ou a rede
// de uma pessoa (UDP bloqueado → TURN). Lê as mudanças de fase da conexão da
// call (callConnection), sem tocar no callStore.

/** O que a próxima amostra da voz leva. */
export interface ConnectionTelemetry {
  connectMs: number | null
  events: TelemetryEvent[]
}

/** De onde a telemetria da voz tira a conexão (createConnectionLog). */
export interface ConnectionSource {
  /** Tudo desde a última vez (tempo para entrar e eventos); leva e limpa. */
  take(): ConnectionTelemetry
  /**
   * Só os eventos (a sessão da call que termina): o tempo para entrar é da
   * call nova e fica para a primeira amostra dela.
   */
  takeEvents(): TelemetryEvent[]
}

/** Evento guardado há mais que isso é de outra call: descarta. */
const MAX_AGE_MS = 5 * 60_000
const MAX_EVENTS = 5

const STEPS: Record<CallJoinStep, string> = { token: 'acesso', signal: 'sinal', media: 'mídia' }

function wherePhase(prev: CallConnection): string {
  if (prev.phase === 'connecting') return `entrando (${prev.step ? STEPS[prev.step] : '—'})`
  return prev.phase === 'reconnecting' ? 'reconectando' : 'conectada'
}

const seconds = (ms: number): string =>
  `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`

/** O que uma mudança de fase diz: tempo para entrar ou um evento. */
export function connectionChange(
  prev: CallConnection,
  next: CallConnection
): { connectMs?: number; event?: TelemetryEvent } {
  if (next.phase === 'connected' && prev.phase === 'connecting') {
    return { connectMs: next.since - prev.since }
  }
  if (next.phase === 'connected' && prev.phase === 'reconnecting') {
    return { event: { type: 'reconectou', detail: seconds(next.since - prev.since) } }
  }
  if (next.phase === 'failed' && prev.phase !== 'failed' && prev.phase !== 'idle') {
    return {
      event: { type: 'conexao_falhou', detail: `${wherePhase(prev)}: ${next.error ?? ''}` }
    }
  }
  return {}
}

/** Junta as mudanças até a telemetria da voz levar (take). */
export function createConnectionLog(now: () => number = Date.now): ConnectionSource & {
  observe: (prev: CallConnection, next: CallConnection) => void
} {
  let connectMs: number | null = null
  let events: { at: number; event: TelemetryEvent }[] = []
  function takeEvents(): TelemetryEvent[] {
    const fresh = events.filter((e) => now() - e.at <= MAX_AGE_MS).map((e) => e.event)
    events = []
    return fresh
  }
  return {
    observe(prev, next) {
      const change = connectionChange(prev, next)
      if (change.connectMs !== undefined) connectMs = change.connectMs
      if (change.event) events = [...events, { at: now(), event: change.event }].slice(-MAX_EVENTS)
    },
    takeEvents,
    take() {
      const out = { connectMs, events: takeEvents() }
      connectMs = null
      return out
    }
  }
}
