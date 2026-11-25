import type { ScreenStatsInput, StatsReport } from '../../call/lib/callStatsSource'
import { callSample } from './telemetryCall'
import { sampleEvents } from './telemetryEvents'
import { shareSample, watchSample, type SampleCounters, type SampleResult } from './telemetrySample'
import { emptySample, type ClientContext, type SessionKind, type TelemetryEvent, type TelemetryReport, type TelemetrySample } from './telemetryTypes'

// Telemetria das lives e calls no Android (cópia adaptada do desktop, observability/lib/telemetryReporter;
// docs/adr/0029, 0032 e 0070): a cada leitura (20 s), uma sessão por coisa ativa — a call, a minha tela e a
// transmissão que assisto — e um pedido só com todas. A voz sai a cada 3 leituras (1 min), com a conexão e os
// sinais do celular. Sessão que some manda o fim. Falhas de envio são ignoradas (é só telemetria).

export const TELEMETRY_INTERVAL_MS = 20_000
/** A voz é lida a cada CALL_EVERY leituras. */
const CALL_EVERY = 3
/** Sessões por pedido (o backend aceita até 8). */
const PER_REQUEST = 8

export interface CallSnapshot {
  /** null = fora de call. */
  callId: string | null
  sharing: boolean
  /** userIds das transmissões que estou assistindo. */
  watching: string[]
}

/** O que vai junto da amostra da voz: tempo para entrar e eventos (conexão e celular). */
export interface CallExtras {
  connectMs: number | null
  events: TelemetryEvent[]
}

export interface ReporterDeps {
  snapshot(): CallSnapshot
  readScreen(userId: string, local: boolean): Promise<ScreenStatsInput | null>
  readCall(): Promise<StatsReport | null>
  context(): Promise<ClientContext>
  send(reports: TelemetryReport[]): Promise<void>
  newId(): string
  /** Desde a última vez; leva e limpa. */
  callExtras(): Promise<CallExtras>
}

interface Wanted {
  key: string
  kind: SessionKind
  callId: string
  /** Dono da live (vai ao backend como streamer_id). */
  streamerId: string
  /** Quem publica no LiveKit: a pessoa ou o helper nativo (`<id>:screen`, ADR 0031). */
  identity: string
}

/** A live do helper nativo sai como `<userId>:screen`; o backend quer o dono. */
const ownerOf = (identity: string): string => identity.replace(/:screen$/, '')

interface Session extends Wanted {
  id: string
  counters: SampleCounters | null
  last: TelemetrySample | null
  ticks: number
}

type Draft = Omit<TelemetryReport, 'context'>

function wantedSessions(snap: CallSnapshot): Wanted[] {
  const callId = snap.callId
  if (!callId) return []
  const one = (kind: SessionKind, identity = ''): Wanted => ({ key: `${callId}|${kind}|${identity}`, kind, callId, streamerId: ownerOf(identity), identity })
  return [one('call'), ...(snap.sharing ? [one('transmite')] : []), ...snap.watching.map((userId) => one('assiste', userId))]
}

function draft(s: Pick<Session, 'id' | 'kind' | 'callId' | 'streamerId'>, sample: TelemetrySample | null, events: TelemetryEvent[], ended: boolean): Draft {
  return { session_id: s.id, kind: s.kind, call_id: s.callId, streamer_id: s.streamerId, sample, events, ended }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function createTelemetryReporter(deps: ReporterDeps): { tick: () => Promise<void> } {
  const sessions = new Map<string, Session>()
  let running: Promise<void> | null = null
  let again = false

  async function read(s: Session): Promise<SampleResult | null> {
    if (s.kind === 'call') {
      if (s.ticks % CALL_EVERY !== 0) return null
      return callSample((await deps.readCall()) ?? new Map(), s.counters)
    }
    const input = await deps.readScreen(s.identity, s.kind === 'transmite')
    if (!input) return null
    return s.kind === 'assiste' ? watchSample(input, s.counters) : shareSample(input, s.counters)
  }

  async function sampleOf(s: Session): Promise<Draft | null> {
    const result = await read(s)
    s.ticks++
    if (!result) return null
    const extra = s.kind === 'call' ? await deps.callExtras() : { connectMs: null, events: [] }
    const sample = { ...result.sample, connect_ms: extra.connectMs ?? result.sample.connect_ms }
    const events = [...extra.events, ...sampleEvents(s.kind, s.last, sample, result.component)]
    // Sem relatório (a voz ainda entrando, ou sozinho e mudo) não vira base: a próxima leitura é a primeira.
    if (result.counters.timestamp > 0) s.counters = result.counters
    s.last = sample
    return draft(s, sample, events, false)
  }

  async function endGone(wanted: Wanted[]): Promise<Draft[]> {
    const keys = new Set(wanted.map((w) => w.key))
    const ended: Draft[] = []
    for (const [key, s] of sessions) {
      if (keys.has(key)) continue
      ended.push(s.kind === 'call' ? endCall(s, await deps.callExtras()) : draft(s, null, [], true))
      sessions.delete(key)
    }
    return ended
  }

  /** O fim da voz leva os eventos e o tempo para entrar que sobrou (call curta ou entrada lenta). */
  function endCall(s: Session, extra: CallExtras): Draft {
    const sample = extra.connectMs === null ? null : { ...emptySample(), connect_ms: extra.connectMs }
    return draft(s, sample, extra.events, true)
  }

  /** Fora de call, sem sessão de voz para levar: a entrada falhou antes da primeira leitura. */
  async function orphan(): Promise<Draft[]> {
    const { events } = await deps.callExtras()
    return events.length > 0 ? [draft({ id: deps.newId(), kind: 'call', callId: '', streamerId: '' }, null, events, true)] : []
  }

  async function collect(): Promise<Draft[]> {
    const wanted = wantedSessions(deps.snapshot())
    const drafts = await endGone(wanted)
    if (wanted.length === 0 && !drafts.some((d) => d.kind === 'call')) return [...drafts, ...(await orphan())]
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
    for (const batch of chunks(drafts, PER_REQUEST)) await deps.send(batch.map((d) => ({ ...d, context })))
  }

  async function run(): Promise<void> {
    do {
      again = false
      // Telemetria nunca atrapalha a call: a próxima leitura tenta de novo.
      await collect().then(send).catch(() => {})
    } while (again)
    running = null
  }

  return {
    /** Leitura pedida durante outra: roda logo depois dela (a última, ao sair da call, não se perde). */
    tick() {
      if (running) {
        again = true
        return running
      }
      running = run()
      return running
    }
  }
}
