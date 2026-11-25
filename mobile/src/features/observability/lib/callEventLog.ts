import type { TelemetryEvent } from './telemetryTypes'

// Os eventos da voz entre uma amostra e outra (conexão e sinais do celular, docs/adr/0070), na ordem em que
// aconteceram, até a telemetria levar. Puro.

/** Evento guardado há mais que isso é de outra call: descarta. */
const MAX_AGE_MS = 5 * 60_000
/** O backend aceita até 10 por sessão; os mais novos ficam. */
const MAX_EVENTS = 8

export interface CallEventLog {
  add(type: string, detail?: string): void
  pending(): boolean
  take(): TelemetryEvent[]
}

export function createCallEventLog(now: () => number = Date.now): CallEventLog {
  let events: { at: number; event: TelemetryEvent }[] = []
  return {
    add(type, detail = '') {
      events = [...events, { at: now(), event: { type, detail } }].slice(-MAX_EVENTS)
    },
    pending: () => events.length > 0,
    take() {
      const fresh = events.filter((e) => now() - e.at <= MAX_AGE_MS).map((e) => e.event)
      events = []
      return fresh
    }
  }
}

/** "4,5 s" ou "1,5 min" (detalhe técnico dos eventos). */
export function durationText(ms: number): string {
  const minutes = ms >= 60_000
  const value = (minutes ? ms / 60_000 : ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return `${value} ${minutes ? 'min' : 's'}`
}
