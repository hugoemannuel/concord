import { AudioSession } from '@livekit/react-native'
import { Track, type Room } from 'livekit-client'
import { readCallReport, type CallStatsRoom } from './callStatsReport'
import type { CallStatsReader, ScreenStatsInput, StatsReport } from './callStatsSource'

// A leitura do getStats() da sala para a telemetria (docs/adr/0070). Fala com o SDK, como livekitMedia.ts e
// livekitScreen.tsx (ADR 0023); o teste usa uma sala falsa. As contas ficam na telemetria (observability/lib).

const EMPTY = (): StatsReport => new Map()

async function readLocal(room: Room): Promise<ScreenStatsInput | null> {
  const track = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack
  if (!track) return null
  return {
    report: (await track.getRTCStatsReport().catch(() => undefined)) ?? EMPTY(),
    streamState: 'active',
    requestedFps: track.publishOptions?.screenShareEncoding?.maxFramerate ?? null
  }
}

async function readRemote(room: Room, userId: string): Promise<ScreenStatsInput | null> {
  const publication = room.remoteParticipants.get(userId)?.getTrackPublication(Track.Source.ScreenShare)
  const track = publication?.track
  if (!track) return null
  return { report: (await track.getRTCStatsReport().catch(() => undefined)) ?? EMPTY(), streamState: track.streamState, requestedFps: null }
}

export function createLiveKitStats(room: Room): CallStatsReader {
  return {
    readScreen: (userId, local) => (local ? readLocal(room) : readRemote(room, userId)),
    readCall: () => readCallReport(room as unknown as CallStatsRoom),
    readAudioOutputs: () => AudioSession.getAudioOutputs()
  }
}
