import type { Stat, StatsReport } from './callStatsSource'

// getStats() da voz da chamada, para a telemetria (cópia adaptada do desktop, call/lib/callStatsReport): o meu
// microfone (RTT, perda e jitter vistos pelo servidor, par ICE: UDP, TCP ou TURN) e a voz de cada pessoa que eu
// ouço (áudio sintetizado, perda até mim), num relatório só. Puro sobre a sala.

/** Track.Source.Microphone do livekit-client (o mock do Jest não traz o enum). */
export const MICROPHONE = 'microphone'

interface StatsPublication {
  track?: { getRTCStatsReport(): Promise<StatsReport | undefined> }
}

interface StatsParticipant {
  getTrackPublication(source: never): StatsPublication | undefined
}

export interface CallStatsRoom {
  localParticipant: StatsParticipant
  remoteParticipants: Map<string, StatsParticipant>
}

async function reportOf(publication: StatsPublication | undefined): Promise<StatsReport | null> {
  try {
    return (await publication?.track?.getRTCStatsReport()) ?? null
  } catch {
    // Faixa removida durante a leitura.
    return null
  }
}

export async function readCallReport(room: CallStatsRoom): Promise<StatsReport | null> {
  const mic = (p: StatsParticipant): StatsPublication | undefined => p.getTrackPublication(MICROPHONE as never)
  const publications = [mic(room.localParticipant), ...[...room.remoteParticipants.values()].map(mic)]
  const reports = await Promise.all(publications.map(reportOf))
  const merged = new Map<string, Stat>()
  reports.forEach((report) => report?.forEach((stat, id) => merged.set(id, stat)))
  return merged.size > 0 ? merged : null
}
