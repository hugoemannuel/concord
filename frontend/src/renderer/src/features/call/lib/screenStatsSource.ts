import { Track } from 'livekit-client'
import type { ScreenStatsInput } from './screenStats'
import { loadVideoDriverHint } from './videoDriverHint'
import { screenHelperIdentity } from './screenIdentity'
import { useScreenCodecFallbackStore } from '../store/screenCodecFallbackStore'

// Lê, sob demanda, o getStats() do vídeo da live (o meu envio ou a recepção da
// de outra pessoa) e o estado da publicação. Só roda com o painel aberto.

interface StatsTrack {
  getRTCStatsReport(): Promise<RTCStatsReport | undefined>
}

/** Codec de reserva (VP8/H.264) publicando por um sender próprio. */
interface BackupCodecs {
  simulcastCodecs?: Map<string, { sender?: { getStats(): Promise<RTCStatsReport> } }>
}

export interface StatsRoomLike {
  localParticipant: {
    getTrackPublication(source: Track.Source):
      | {
          videoTrack?: StatsTrack &
            BackupCodecs & {
            publishOptions?: { screenShareEncoding?: { maxFramerate?: number } }
          }
        }
      | undefined
  }
  remoteParticipants: Map<
    string,
    {
      getTrackPublication(
        source: Track.Source
      ): { isEnabled: boolean; track?: StatsTrack & { streamState: string } } | undefined
    }
  >
}

const EMPTY = (): RTCStatsReport => new Map() as unknown as RTCStatsReport

/**
 * O envio principal e o dos codecs de reserva num relatório só: quando o SFU
 * pede a reserva, o principal pausa e o vídeo sai pelo outro sender.
 */
export async function senderReports(track: StatsTrack & BackupCodecs): Promise<RTCStatsReport> {
  const senders = [...(track.simulcastCodecs?.values() ?? [])].flatMap((codec) =>
    codec.sender ? [codec.sender.getStats().catch(() => undefined)] : []
  )
  const reports = await Promise.all([track.getRTCStatsReport(), ...senders])
  const merged = new Map<string, unknown>()
  reports.forEach((report) => report?.forEach((stat, id) => merged.set(id, stat)))
  return merged as unknown as RTCStatsReport
}

async function readLocal(room: StatsRoomLike): Promise<ScreenStatsInput | null> {
  const track = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack
  if (!track) return null
  return {
    local: true,
    report: await senderReports(track),
    enabled: true,
    streamState: 'active',
    requestedFps: track.publishOptions?.screenShareEncoding?.maxFramerate ?? null,
    codecFallback: useScreenCodecFallbackStore.getState().fallback
  }
}

async function readRemote(room: StatsRoomLike, userId: string): Promise<ScreenStatsInput | null> {
  // A live pode sair pelo app (userId) ou pelo helper nativo (`<userId>:screen`).
  const publication = [userId, screenHelperIdentity(userId)]
    .map((id) => room.remoteParticipants.get(id)?.getTrackPublication(Track.Source.ScreenShare))
    .find(Boolean)
  if (!publication) return null
  return {
    local: false,
    report: (await publication.track?.getRTCStatsReport()) ?? EMPTY(),
    enabled: publication.isEnabled,
    streamState: publication.track?.streamState ?? 'active',
    requestedFps: null,
    driverHint: await loadVideoDriverHint()
  }
}

/** null = essa live não está publicada (acabou ou ainda não chegou). */
export function readScreenStatsInput(
  room: StatsRoomLike,
  userId: string,
  local: boolean
): Promise<ScreenStatsInput | null> {
  return local ? readLocal(room) : readRemote(room, userId)
}

export interface ScreenStatsReader {
  readScreenStats(userId: string, local: boolean): Promise<ScreenStatsInput | null>
  /** getStats() da voz (telemetria das calls; ver callStatsReport). */
  readCallStats?(): Promise<RTCStatsReport | null>
}

// A chamada atual (o CallMedia se registra ao nascer e sai ao desconectar):
// o painel lê sem passar pelo callStore.
let active: ScreenStatsReader | null = null

export function setActiveScreenStats(reader: ScreenStatsReader): void {
  active = reader
}

export function clearActiveScreenStats(reader: ScreenStatsReader): void {
  if (active === reader) active = null
}

export async function readActiveScreenStats(
  userId: string,
  local: boolean
): Promise<ScreenStatsInput | null> {
  return (await active?.readScreenStats(userId, local)) ?? null
}

/** A voz da chamada atual, para a telemetria (null = sem chamada). */
export async function readActiveCallStats(): Promise<RTCStatsReport | null> {
  return (await active?.readCallStats?.()) ?? null
}
