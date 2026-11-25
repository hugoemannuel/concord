import type { TimedEvent } from './telemetryOutbox'
import type { MediaSignals, SessionKind } from './telemetryTypes'

// O que vai junto da amostra e não vem do getStats() (docs/adr/0074): o
// tempo até a minha live no ar, o tempo até o primeiro quadro de cada live
// assistida e, na voz, as lives que não começaram e o PC que dormiu. Cada
// fonte leva e limpa (registros em call/lib e o sleepLog). Puro.

export interface MediaExtraSources {
  liveStart?(): number | null
  firstFrame?(streamerId: string): number | null
  liveFailures?(): TimedEvent[]
  sleeps?(): TimedEvent[]
}

export interface MediaExtras {
  patch: Partial<MediaSignals>
  events: TimedEvent[]
}

const startPatch = (ms: number | null | undefined): Partial<MediaSignals> =>
  ms == null ? {} : { start_ms: ms }

export function mediaExtras(
  sources: MediaExtraSources | undefined,
  kind: SessionKind,
  streamerId: string
): MediaExtras {
  if (kind === 'transmite') return { patch: startPatch(sources?.liveStart?.()), events: [] }
  if (kind === 'assiste')
    return { patch: startPatch(sources?.firstFrame?.(streamerId)), events: [] }
  return {
    patch: {},
    events: [...(sources?.liveFailures?.() ?? []), ...(sources?.sleeps?.() ?? [])]
  }
}
