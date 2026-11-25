import type { ScreenStatsInput } from '../../call/lib/screenStats'
import { sampleEvents } from './telemetryEvents'
import { callSample } from './telemetryCall'
import type { ConnectionSource, ConnectionTelemetry } from './telemetryConnection'
import { createOutbox, toWire, type Draft, type TimedEvent } from './telemetryOutbox'
import { shareSample, watchSample, type SampleCounters, type SampleResult } from './telemetrySample'
import type {
  ClientContext,
  SessionKind,
  TelemetryReport,
  TelemetrySample
} from './telemetryTypes'

// Telemetria das lives e calls (docs/adr/0029 e 0032): a cada leitura (20 s), uma
// sessão por coisa ativa — a call, a minha live e cada live que assisto — e
// um pedido só com todas. A voz sai a cada 3 leituras (1 min). Sessão que
// some manda o fim. O que não foi por falha no envio e tem evento ou fim
// volta no ciclo seguinte (telemetryOutbox); as amostras, não.

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
  connection?: ConnectionSource
  /** Por que a live saiu nesse codec (screenCodecChoice); leva e limpa. */
  codecChoice?(): string | null
  /** Relógio (ms); o padrão é Date.now. */
  now?(): number
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
  events: TimedEvent[],
  ended: boolean,
  at: number
): Draft {
  return {
    session_id: s.id,
    kind: s.kind,
    call_id: s.callId,
    streamer_id: s.streamerId,
    sample,
    events,
    ended,
    at
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
  const outbox = createOutbox()
  const now = (): number => deps.now?.() ?? Date.now()
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

  /** O que vai junto da amostra: a conexão (voz) ou o motivo do codec (minha live). */
  function extras(kind: SessionKind): ConnectionTelemetry {
    if (kind === 'call') return deps.connection?.take() ?? NOTHING
    const choice = kind === 'transmite' ? deps.codecChoice?.() : null
    return choice
      ? { connectMs: null, events: [{ type: 'codec_escolhido', detail: choice }] }
      : NOTHING
  }

  async function sampleOf(s: Session): Promise<Draft | null> {
    const result = await read(s)
    s.ticks++
    if (!result) return null
    const extra = extras(s.kind)
    const sample = { ...result.sample, connect_ms: extra.connectMs ?? result.sample.connect_ms }
    const events = [...extra.events, ...sampleEvents(s.kind, s.last, sample)]
    s.counters = result.counters
    s.last = sample
    return draft(s, sample, events, false, now())
  }

  function endGone(wanted: Wanted[]): Draft[] {
    const keys = new Set(wanted.map((w) => w.key))
    const ended: Draft[] = []
    for (const [key, s] of sessions) {
      if (keys.has(key)) continue
            // Só os eventos: o tempo para entrar, se houver, é da call nova.
      const events = s.kind === 'call' ? (deps.connection?.takeEvents() ?? []) : []
      ended.push(draft(s, null, events, true, now()))
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

  /** Manda em pedidos de até 8; devolve o que não foi. */
  async function sendAll(pending: Draft[]): Promise<Draft[]> {
    const batches = chunks(pending, PER_REQUEST)
    try {
      const context = await deps.context()
      for (const [i, batch] of batches.entries()) {
        try {
          const at = now()
          await deps.send(batch.map((d) => toWire(d, context, at)))
        } catch {
          return batches.slice(i).flat()
        }
      }
      return []
    } catch {
      return pending
    }
  }

  /** O que ficou da vez anterior vai primeiro; o que não for, espera a próxima. */
  async function send(drafts: Draft[]): Promise<void> {
    const pending = [...outbox.take(now()), ...drafts]
    if (pending.length === 0) return
    outbox.keep(await sendAll(pending))
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
