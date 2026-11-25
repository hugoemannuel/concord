// Quanto a minha live demorou para entrar no ar e por que não começou
// (telemetria, docs/adr/0074): o ScreenSender (Chromium), o seletor e a live
// nativa anotam aqui, e a telemetria leva (o tempo na 1ª amostra da live, as
// falhas na sessão da voz: a live nem chegou a existir). Fora do callStore.

/** Acima disso foi a pessoa (ou o sistema) que demorou, não a live. */
export const MAX_START_MS = 60_000
const MAX_FAILURES = 5

export type LiveStartStage = 'seletor' | 'codec' | 'publicação' | 'nativo'

export interface LiveFailureEvent {
  type: 'live_falhou'
  detail: string
  at: number
}

let startMs: number | null = null
let failures: LiveFailureEvent[] = []

/** O nome técnico do erro (NotReadableError, código do helper); a mensagem nunca. */
export function failureName(err: unknown): string {
  if (err instanceof Error || err instanceof DOMException) return err.name
  if (typeof err === 'string' && /^[\w.-]{1,40}$/.test(err)) return err
  return 'erro'
}

export function noteLiveStart(ms: number): void {
  startMs = ms >= 0 && ms <= MAX_START_MS ? Math.round(ms) : null
}

export function takeLiveStart(): number | null {
  const out = startMs
  startMs = null
  return out
}

export function noteLiveFailure(stage: LiveStartStage, err: unknown, now = Date.now()): void {
  const event: LiveFailureEvent = {
    type: 'live_falhou',
    detail: `${stage} · ${failureName(err)}`,
    at: now
  }
  failures = [...failures, event].slice(-MAX_FAILURES)
}

export function takeLiveFailures(): LiveFailureEvent[] {
  const out = failures
  failures = []
  return out
}
