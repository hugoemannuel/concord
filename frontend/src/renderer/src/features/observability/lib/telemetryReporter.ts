import type { ScreenStatsInput } from '../../call/lib/screenStats'
import { sampleEvents } from './telemetryEvents'
import { callSample } from './telemetryCall'
import type { ConnectionTelemetry } from './telemetryConnection'
import { shareSample, watchSample, type SampleCounters, type SampleResult } from './telemetrySample'
import type {
  ClientContext,
  SessionKind,
  TelemetryEvent,
  TelemetryReport,
  TelemetrySample
} from './telemetryTypes'

// Telemetria das lives e calls (docs/adr/0029 e 0032): a cada leitura (20 s), uma
// sessão por coisa ativa — a call, a minha live e cada live que assisto — e
// um pedido só com todas. A voz sai a cada 3 leituras (1 min). Sessão que
// some manda o fim. Falhas de envio são ignoradas (é só telemetria).

export const TELEMETRY_INTERVAL_MS = 20_000
/** A voz é lida a cada CALL_EVERY leituras. */
const CALL_EVERY = 3
/** Sessões por pedido (o backend aceita até 8). */
const PER_REQUEST = 8

export interface CallSnapshot {
  /** null = fora de call. */
  callId: string | null
  sharing: boolean
  /** userIds das lives que estou assistindo. */
  watching: string[]
}

export interface ReporterDeps {
  snapshot(): CallSnapshot
  readScreen(userId: string, local: boolean): Promise<ScreenStatsInput | null>
  readCall(): Promise<RTCStatsReport | null>
  context(): Promise<ClientContext>
  send(reports: TelemetryReport[]): Promise<void>
  newId(): string
  /** Conexão da voz desde a última vez (telemetryConnection); leva e limpa. */
  connection?(): ConnectionTelemetry
  /** Por que a live saiu nesse codec (screenCodecChoice); leva e limpa. */
  codecChoice?(): string | null
  /** O H.265 da live desse streamer chegou e não decodificou (screenHevcFailure); leva e limpa. */
  decodeFailure?(streamerId: string): string | null
}

interface Wanted {
  key: string
  kind: SessionKind
  callId: string
  streamerId: string
}

interface Session extends Wanted {
  id: string
  counters: SampleCounters | null
  last: TelemetrySample | null
  ticks: number
}

type Draft = Omit<TelemetryReport, 'context'>

const NOTHING: ConnectionTelemetry = { connectMs: null, events: [] }

/** O controlador da minha live trocou de degrau (não conta o começo nem o fim da live). */
export function stepChanged(
  previous: { step: number } | null,
  next: { step: number } | null
): boolean {
  return previous !== null && next !== null && previous.step !== next.step
}

function wantedSessions(snap: CallSnapshot): Wanted[] {
  const callId = snap.callId
  if (!callId) return []
  const one = (kind: SessionKind, streamerId = ''): Wanted => ({
    key: `${callId}|${kind}|${streamerId}`,
    kind,
    callId,
    streamerId
  })
  return [
    one('call'),
    ...(snap.sharing ? [one('transmite')] : []),
    ...snap.watching.map((userId) => one('assiste', userId))
  ]
}

function draft(
  s: Session,
  sample: TelemetrySample | null,
  events: TelemetryEvent[],
  ended: boolean
): Draft {
  return {
    session_id: s.id,
    kind: s.kind,
    call_id: s.callId,
    streamer_id: s.streamerId,
    sample,
    events,
    ended
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function createTelemetryReporter(deps: ReporterDeps): {
  tick: () => Promise<void>
  noteStepChange: () => void
} {
  const sessions = new Map<string, Session>()
  let stepChanges = 0
  let busy = false

  async function read(s: Session): Promise<SampleResult | null> {
    if (s.kind === 'call') {
      if (s.ticks % CALL_EVERY !== 0) return null
      return callSample((await deps.readCall()) ?? new Map(), s.counters)
    }
    const input = await deps.readScreen(s.streamerId, s.kind === 'transmite')
    if (!input) return null
    if (s.kind === 'assiste') return watchSample(input, s.counters)
    const result = shareSample(input, s.counters, stepChanges)
    if (result) stepChanges = 0
    return result
  }

  /** O motivo do codec (minha live) ou a falha do decodificador (live assistida). */
  function extraEvent(s: Wanted): TelemetryEvent | null {
    if (s.kind === 'transmite') {
      const choice = deps.codecChoice?.()
      return choice ? { type: 'codec_escolhido', detail: choice } : null
    }
    const failure = deps.decodeFailure?.(s.streamerId)
    return failure ? { type: 'decoder_falhou', detail: failure } : null
  }

  /** O que vai junto da amostra: a conexão (voz) ou um evento da live. */
  function extras(s: Wanted): ConnectionTelemetry {
    if (s.kind === 'call') return deps.connection?.() ?? NOTHING
    const event = extraEvent(s)
    return event ? { connectMs: null, events: [event] } : NOTHING
  }

  async function sampleOf(s: Session): Promise<Draft | null> {
    const result = await read(s)
    s.ticks++
    if (!result) return null
    const extra = extras(s)
    const sample = { ...result.sample, connect_ms: extra.connectMs ?? result.sample.connect_ms }
    const events = [...extra.events, ...sampleEvents(s.kind, s.last, sample)]
    s.counters = result.counters
    s.last = sample
    return draft(s, sample, events, false)
  }

  function endGone(wanted: Wanted[]): Draft[] {
    const keys = new Set(wanted.map((w) => w.key))
    const ended: Draft[] = []
    for (const [key, s] of sessions) {
      if (keys.has(key)) continue
      ended.push(draft(s, null, s.kind === 'call' ? extras(s).events : [], true))
      sessions.delete(key)
    }
    return ended
  }

  async function collect(): Promise<Draft[]> {
    const wanted = wantedSessions(deps.snapshot())
    const drafts = endGone(wanted)
    for (const w of wanted) {
      let s = sessions.get(w.key)
      if (!s) {
        s = { ...w, id: deps.newId(), counters: null, last: null, ticks: 0 }
        sessions.set(w.key, s)
      }
      const d = await sampleOf(s)
      if (d) drafts.push(d)
    }
    return drafts
  }

  async function send(drafts: Draft[]): Promise<void> {
    if (drafts.length === 0) return
    const context = await deps.context()
    for (const batch of chunks(drafts, PER_REQUEST)) {
      await deps.send(batch.map((d) => ({ ...d, context })))
    }
  }

  return {
    async tick() {
      if (busy) return
      busy = true
      try {
        await send(await collect())
      } catch {
        // Telemetria nunca atrapalha a call: a próxima leitura tenta de novo.
      } finally {
        busy = false
      }
    },
    noteStepChange() {
      stepChanges++
    }
  }
}
