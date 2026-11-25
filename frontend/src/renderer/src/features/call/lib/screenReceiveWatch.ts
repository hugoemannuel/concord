import { mediaOwner } from './screenIdentity'
import { hevcGuardTick, initialHevcGuard, type HevcGuardState } from './screenHevcDecodeGuard'
import { receiveCounters, receiveRates, type ReceiveCounters, type ReceiveRates } from './screenReceiveRates'

// Vigia a recepção das lives que estou assistindo (a cada 2 s, só as
// assinadas e com vídeo ligado) e passa cada leitura ao detector do H.265 que
// chega e não decodifica (marca para a próxima abertura). Ver docs/adr/0073.

export const RECEIVE_TICK_MS = 2000

export interface ReceivePublicationLike {
  source: string
  kind: string
  readonly isDesired: boolean
  readonly isEnabled: boolean
  track?: { getRTCStatsReport(): Promise<RTCStatsReport | undefined> }
}

export interface ReceiveParticipantLike {
  identity: string
  trackPublications: Map<string, ReceivePublicationLike>
}

export interface ReceiveWatchDeps {
  participants(): Iterable<ReceiveParticipantLike>
  /** O H.265 da live de `userId` chega e não decodifica (uma vez por chamada). */
  onHevcFailed(userId: string, rates: ReceiveRates): void
}

interface Watched {
  counters: ReceiveCounters | null
  hevc: HevcGuardState
}

function screenOf(participant: ReceiveParticipantLike): ReceivePublicationLike | null {
  for (const publication of participant.trackPublications.values()) {
    if (publication.source === 'screen_share' && publication.kind === 'video' && publication.isDesired)
      return publication
  }
  return null
}

export class ScreenReceiveWatch {
  private timer: ReturnType<typeof setInterval> | null = null
  private busy = false
  private watched = new Map<string, Watched>()
  private hevcReported = false

  constructor(private readonly deps: ReceiveWatchDeps) {}

  start(): void {
    this.timer ??= setInterval(() => void this.tick(), RECEIVE_TICK_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.watched.clear()
  }

  private async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      await this.readAll()
    } catch {
      /* Leitura falhou: a próxima tenta de novo. */
    } finally {
      this.busy = false
    }
  }

  private async readAll(): Promise<void> {
    const seen = new Set<string>()
    for (const participant of [...this.deps.participants()]) {
      const publication = screenOf(participant)
      if (!publication) continue
      seen.add(participant.identity)
      await this.readOne(participant.identity, publication)
    }
    this.forget(seen)
  }

  private async readOne(identity: string, publication: ReceivePublicationLike): Promise<void> {
    const watched = this.entry(identity)
    const report = publication.isEnabled ? await publication.track?.getRTCStatsReport() : undefined
    const counters = report && this.timer ? receiveCounters(report) : null
    // Pausada (fora de vista) ou sem leitura: o próximo intervalo recomeça do zero.
    const rates = counters ? receiveRates(watched.counters, counters) : null
    watched.counters = counters
    if (!counters) return
    this.checkHevc(identity, watched, rates)
  }

  private entry(identity: string): Watched {
    let watched = this.watched.get(identity)
    if (!watched) {
      watched = { counters: null, hevc: initialHevcGuard() }
      this.watched.set(identity, watched)
    }
    return watched
  }

  private checkHevc(identity: string, watched: Watched, rates: ReceiveRates | null): void {
    if (this.hevcReported) return
    watched.hevc = hevcGuardTick(watched.hevc, rates)
    if (!watched.hevc.failed || !rates) return
    this.hevcReported = true
    this.deps.onHevcFailed(mediaOwner(identity), rates)
  }

  /** Parou de assistir: esquece. */
  private forget(seen: Set<string>): void {
    for (const identity of this.watched.keys()) {
      if (!seen.has(identity)) this.watched.delete(identity)
    }
  }
}
