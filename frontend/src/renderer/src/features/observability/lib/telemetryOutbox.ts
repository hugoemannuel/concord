import type { ClientContext, TelemetryEvent, TelemetryReport } from './telemetryTypes'

// O que a telemetria manda e o que espera para ir de novo (docs/adr/0032,
// emenda de 2026-11-25): numa queda do servidor, os eventos (reconectou,
// conexão falhou) e os fins não podem sumir. Fica numa fila curta, sem as
// amostras, e vai no ciclo seguinte com "há quanto tempo" (ago_ms), para o
// servidor gravar a hora do fato. Puro.

/** Rascunhos guardados no máximo (os mais novos ficam). */
export const OUTBOX_MAX = 20
/** Mais velho que isso não vale reenviar (o servidor também corta aqui). */
export const OUTBOX_MAX_AGE_MS = 15 * 60_000

/** Evento com a hora em que aconteceu (sem ela, a do rascunho). */
export interface TimedEvent extends TelemetryEvent {
  at?: number
}

/** Um relatório ainda sem o contexto, com a hora em que foi montado. */
export interface Draft extends Omit<TelemetryReport, 'context' | 'events' | 'ago_ms'> {
  events: TimedEvent[]
  at: number
}

/** Vale reenviar: tem evento ou é o fim. A amostra fica de fora (perdeu o sentido). */
export function retryable(d: Draft): Draft | null {
  return d.events.length > 0 || d.ended ? { ...d, sample: null } : null
}

const since = (now: number, at: number): number => Math.max(0, Math.round(now - at))

/** O formato do backend: as horas viram "há quanto tempo". */
export function toWire(d: Draft, context: ClientContext, now: number): TelemetryReport {
  const { at, events, ...rest } = d
  return {
    ...rest,
    context,
    ago_ms: since(now, at),
    events: events.map(({ at: eventAt, ...e }) => ({ ...e, ago_ms: since(now, eventAt ?? at) }))
  }
}

/** O servidor recusou de vez (4xx que não é 429): reenviar não adianta. */
export function isPermanentFailure(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 429
}

export function createOutbox(): {
  /** Leva até `max` dos que ainda valem, os mais velhos primeiro (o resto fica). */
  take: (now: number, max?: number) => Draft[]
  /** Guarda o que não foi (só o que vale reenviar). */
  keep: (drafts: Draft[]) => void
} {
  let kept: Draft[] = []
  return {
    take(now, max = OUTBOX_MAX) {
      const valid = kept.filter((d) => now - d.at <= OUTBOX_MAX_AGE_MS)
      kept = valid.slice(max)
      return valid.slice(0, max)
    },
    keep(drafts) {
      kept = [...kept, ...drafts.flatMap((d) => retryable(d) ?? [])].slice(-OUTBOX_MAX)
    }
  }
}
