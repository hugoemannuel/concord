import type { CallPhase } from '../../call/lib/callTypes'
import { durationText, type CallEventLog } from './callEventLog'

// Telemetria da conexão da voz pelas fases da chamada (callSessionStore, só lido; docs/adr/0032 e 0070): quanto
// demorou para entrar e quanto tempo ficou fora quando caiu e voltou. As falhas vêm da sonda (connectionProbe).

export interface ConnectionObserver {
  observe(prev: CallPhase, next: CallPhase): void
  /** Tempo para entrar da última entrada (uma vez); null se não houve. */
  takeConnectMs(): number | null
}

export function createConnectionObserver(log: CallEventLog, now: () => number = Date.now): ConnectionObserver {
  let since = now()
  let connectMs: number | null = null
  return {
    observe(prev, next) {
      if (prev === next) return
      if (next === 'active' && prev === 'connecting') connectMs = now() - since
      if (next === 'active' && prev === 'reconnecting') log.add('reconectou', durationText(now() - since))
      since = now()
    },
    takeConnectMs() {
      const value = connectMs
      connectMs = null
      return value
    }
  }
}
