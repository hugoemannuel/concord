// Codec de reserva da live (H.264/VP8 para quem não decodifica o principal).
// O SDK a publica num sender próprio, sobre um clone da captura, com o
// screenShareEncoding inteiro da live (1080p60 a 7 Mbps: o `encoding` do
// backupCodec é ignorado em tela) e sem o controlador de qualidade. Aqui ela
// vira 720p30 com prioridade baixa na banda, para não tirar fluidez do envio
// principal. O codificador (placa ou processador) é o que o Chromium escolhe
// para o codec. Ver docs/adr/0020.

import { evenScale } from './screenScale'

/** Teto da reserva: o piso da live (720p30), um pouco abaixo dos 3 Mbps da Twitch. */
export const BACKUP_ENCODING = { maxBitrate: 2_500_000, maxFramerate: 30 } as const
const BACKUP_HEIGHT = 720

interface BackupCodecInfo {
  mediaStreamTrack: { contentHint: string; getSettings(): MediaTrackSettings }
  encodings?: RTCRtpEncodingParameters[]
}

/** O pedaço do LocalVideoTrack do livekit-client que a reserva usa. */
export interface BackupTrack {
  mediaStreamTrack: { contentHint: string }
  simulcastCodecs: Map<string, BackupCodecInfo>
  setSimulcastTrackSender(codec: string, sender: RTCRtpSender): Promise<void>
}

/** 720p30 pelo lado menor da captura (nunca amplia, lados pares), prioridade baixa. */
export function backupEncoding(settings: MediaTrackSettings): RTCRtpEncodingParameters {
  const { width = 0, height = 0 } = settings
  return {
    ...BACKUP_ENCODING,
    // Lado ímpar faz o H.264 da placa cair no processador (ver screenScale).
    scaleResolutionDownBy: evenScale(width, height, BACKUP_HEIGHT),
    priority: 'low',
    networkPriority: 'low'
  }
}

async function applyBackup(info: BackupCodecInfo, sender: RTCRtpSender): Promise<void> {
  const parameters = sender.getParameters()
  // O SDK cria a reserva de tela numa camada só; outra forma não é nossa.
  if (parameters.encodings.length !== 1) return
  // `active` fica como o dynacast deixou.
  Object.assign(parameters.encodings[0], backupEncoding(info.mediaStreamTrack.getSettings()))
  await sender.setParameters(parameters)
  info.encodings = [{ ...parameters.encodings[0] }]
}

/**
 * O SDK cria a reserva quando um assinante pede (`setSimulcastTrackSender`);
 * esse é o momento de trocar o encoding, antes de o vídeo ganhar banda.
 */
export function tuneScreenBackup(track: BackupTrack): void {
  const original = track.setSimulcastTrackSender.bind(track)
  track.setSimulcastTrackSender = async (codec, sender) => {
    await original(codec, sender)
    const info = track.simulcastCodecs.get(codec)
    if (!info) return
    info.mediaStreamTrack.contentHint = track.mediaStreamTrack.contentHint
    // Recusado: a reserva segue como o SDK criou, mas a live continua.
    await applyBackup(info, sender).catch(() => {})
  }
}

/** A dica de conteúdo mudou (degrau com outro fps): o clone da reserva acompanha. */
export function syncBackupHint(track: BackupTrack): void {
  track.simulcastCodecs.forEach((info) => {
    info.mediaStreamTrack.contentHint = track.mediaStreamTrack.contentHint
  })
}
