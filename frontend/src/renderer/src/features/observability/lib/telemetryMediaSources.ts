import { takeFirstFrame } from '../../call/lib/screenFirstFrame'
import { takeLiveFailures, takeLiveStart } from '../../call/lib/screenStartTelemetry'
import type { TimedEvent } from './telemetryOutbox'
import type { MediaExtraSources } from './telemetryMediaExtras'

/** Os registros da ADR 0074 que a telemetria leva (cada um leva e limpa). */
export function mediaSources(sleeps: () => TimedEvent[]): MediaExtraSources {
  return {
    liveStart: takeLiveStart,
    firstFrame: takeFirstFrame,
    liveFailures: takeLiveFailures,
    sleeps
  }
}
