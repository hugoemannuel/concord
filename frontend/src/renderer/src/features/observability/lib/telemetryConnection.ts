import type { CallConnection } from '../../call/lib/callConnection'
import { createJoinTracker, seconds, STEPS } from './telemetryJoin'
import type { TimedEvent } from './telemetryOutbox'
import type { TelemetryEvent } from './telemetryTypes'

// Telemetria da conexão da voz (docs/adr/0032): quanto demorou para entrar,
// quando caiu e voltou, e em que etapa não conectou — para saber se é o
// servidor (todo mundo ao mesmo tempo, ex.: LIVEKIT_NODE_IP errado) ou a rede
// de uma pessoa (UDP bloqueado → TURN). Lê as mudanças de fase da conexão da
// call (callConnection), sem tocar no callStore.

/** O que a próxima amostra da voz leva. */
export interface ConnectionTelemetry {
  connectMs: number | null
  /** Com a hora em que cada um aconteceu. */
  events: TimedEvent[]
}

/** Eventos de uma call que não tem sessão (saiu durante a entrada, antes do primeiro ciclo). */
export interface StrayEvents {
  callId: string
  events: TimedEvent[]
}

/**
 * De onde a telemetria da voz tira a conexão (createConnectionLog). Cada
 * evento e o tempo para entrar são da call em que aconteceram: a sessão de
 * uma call nunca leva o que é de outra.
 */
export interface ConnectionSource {
  /** O tempo para entrar e os eventos da call; leva e limpa. */
  take(callId: string): ConnectionTelemetry
  /** Só os eventos da call (a sessão que termina); o tempo para entrar fica. */
  takeEvents(callId: string): TimedEvent[]
  /** Os eventos das outras calls, que não têm sessão; leva e limpa. */
  takeStray(current: string | null): StrayEvents[]
}

/** Evento guardado há mais que isso já não vale: descarta. */
const MAX_AGE_MS = 5 * 60_000
const MAX_EVENTS = 5

function wherePhase(prev: CallConnection): string {
  if (prev.phase === 'connecting') return `entrando (${prev.step ? STEPS[prev.step] : '—'})`
  return prev.phase === 'reconnecting' ? 'reconectando' : 'conectada'
}

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

interface Logged {
  at: number
  callId: string
  event: TelemetryEvent
}

const timed = (list: Logged[]): TimedEvent[] => list.map((e) => ({ ...e.event, at: e.at }))

/** Agrupa por call, na ordem. */
function byCall(list: Logged[]): StrayEvents[] {
  const groups = new Map<string, Logged[]>()
  for (const e of list) groups.set(e.callId, [...(groups.get(e.callId) ?? []), e])
  return [...groups].map(([callId, events]) => ({ callId, events: timed(events) }))
}

/** Junta as mudanças, marcadas com a call, até a telemetria da voz levar (take). */
export function createConnectionLog(now: () => number = Date.now): ConnectionSource & {
  observe: (prev: CallConnection, next: CallConnection, callId?: string) => void
} {
  let connect: { ms: number; callId: string } | null = null
  let events: Logged[] = []
  const join = createJoinTracker()
  const push = (event: TelemetryEvent, callId: string): void => {
    events = [...events, { at: now(), callId, event }].slice(-MAX_EVENTS)
  }
  /** Leva os eventos das calls que `pick` escolhe; os velhos demais somem. */
  function takeWhere(pick: (callId: string) => boolean): Logged[] {
    const fresh = events.filter((e) => now() - e.at <= MAX_AGE_MS)
    events = fresh.filter((e) => !pick(e.callId))
    return fresh.filter((e) => pick(e.callId))
  }
  const takeEvents = (callId: string): TimedEvent[] => timed(takeWhere((id) => id === callId))
  return {
    observe(prev, next, callId = '') {
      const change = connectionChange(prev, next)
      if (change.connectMs !== undefined) connect = { ms: change.connectMs, callId }
      if (change.event) push(change.event, callId)
      const joinEvent = join(prev, next, now())
      if (joinEvent) push(joinEvent, callId)
    },
    takeEvents,
    take(callId) {
      const mine = connect?.callId === callId ? connect : null
      if (mine) connect = null
      return { connectMs: mine?.ms ?? null, events: takeEvents(callId) }
    },
    takeStray: (current) => byCall(takeWhere((id) => id !== current))
  }
}
