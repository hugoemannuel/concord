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

/**
 * `first`: a 1ª amostra da sessão. O tempo até o ar e até o 1º quadro só vão
 * nela; depois são levados e descartados (uma republicação na reconexão não
 * vira um segundo tempo no meio da live).
 */
export function mediaExtras(
  sources: MediaExtraSources | undefined,
  kind: SessionKind,
  streamerId: string,
  first = true
): MediaExtras {
  const start = (ms: number | null | undefined): MediaExtras => ({
    patch: first ? startPatch(ms) : {},
    events: []
  })
  if (kind === 'transmite') return start(sources?.liveStart?.())
  if (kind === 'assiste') return start(sources?.firstFrame?.(streamerId))
  return {
    patch: {},
    events: [...(sources?.liveFailures?.() ?? []), ...(sources?.sleeps?.() ?? [])]
  }
}
