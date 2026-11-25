import type { TimedEvent } from './telemetryOutbox'

// O PC dormiu com a call aberta (docs/adr/0074): o main avisa ao acordar
// (powerMonitor, o mesmo do main/deviceStats) quanto tempo ficou suspenso, e a
// telemetria da voz leva o evento pc_dormiu na hora em que acordou. Quem lê a
// queda logo depois sabe que não foi a rede.

const MAX = 5

export function createSleepLog(now: () => number = Date.now): {
  note: (sleptMs: number) => void
  take: () => TimedEvent[]
} {
  let events: TimedEvent[] = []
  return {
    note(sleptMs) {
      const detail = `${Math.round(sleptMs / 1000)} s`
      events = [...events, { type: 'pc_dormiu', detail, at: now() }].slice(-MAX)
    },
    take() {
      const out = events
      events = []
      return out
    }
  }
}
