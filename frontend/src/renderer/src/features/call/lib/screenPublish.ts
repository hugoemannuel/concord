import {
  AudioPresets,
  BackupCodecPolicy,
  Track,
  type LocalParticipant,
  type LocalVideoTrack
} from 'livekit-client'
import { syncBackupHint, tuneScreenBackup } from './screenBackup'
import type { ScreenCodecOptions } from './screenCodec'
import { requireHighH264 } from './screenH264Profile'
import {
  screenEncoding,
  screenMotion,
  screenSource,
  screenVideoConstraints,
  streamQuality,
  type ScreenShareQuality
} from './screenShareQuality'
import { screenSenderEncodings, simulcastLayers } from './screenSimulcast'

// Publicação da tela (vídeo + som) e troca de qualidade ao vivo, sem
// despublicar. Quem decide se a sala está conectada é o CallMedia (`connected`).

/** Como publicar: codec (AV1/H.264/VP8 e reserva) e a camada extra de 720p. */
export interface ScreenPublishPlan {
  codec: ScreenCodecOptions
  simulcast: boolean
  /** A placa só codifica o H.264 no High (principal ou reserva; ver screenH264Profile). */
  h264High: boolean
}

export async function publishScreenTracks(
  participant: LocalParticipant,
  stream: MediaStream,
  plan: ScreenPublishPlan
): Promise<void> {
  const [video] = stream.getVideoTracks()
  if (video) await publishScreenVideo(participant, stream, plan)
  const [audio] = stream.getAudioTracks()
  if (audio) {
    await participant.publishTrack(audio, {
      source: Track.Source.ScreenShareAudio,
      name: 'screen-audio',
      audioPreset: AudioPresets.musicHighQualityStereo,
      forceStereo: true,
      dtx: false,
      red: false
    })
  }
}

/** Só o vídeo da tela (o som segue publicado numa republicação). */
export async function publishScreenVideo(
  participant: LocalParticipant,
  stream: MediaStream,
  plan: ScreenPublishPlan
): Promise<void> {
  const [video] = stream.getVideoTracks()
  const quality = streamQuality(stream)
  const settings = video.getSettings()
  requireHighH264(plan.h264High)
  const publication = await participant.publishTrack(video, {
    source: Track.Source.ScreenShare,
    name: 'screen',
    simulcast: plan.simulcast,
    ...(plan.simulcast ? { screenShareSimulcastLayers: simulcastLayers(settings) } : {}),
    screenShareEncoding: screenEncoding(quality, settings),
    // Codec por publicação: só a tela; a câmera segue o padrão da sala (VP8).
    ...plan.codec,
    // Quem decodifica o principal continua nele; só quem não decodifica recebe a reserva.
    ...(plan.codec.backupCodec ? { backupCodecPolicy: BackupCodecPolicy.SIMULCAST } : {}),
    degradationPreference: screenMotion(quality.frameRate).degradationPreference
  })
  if (plan.codec.backupCodec && publication.videoTrack) tuneScreenBackup(publication.videoTrack)
}

/**
 * Troca o codec da tela publicada (o anterior trocou sozinho no navegador):
 * despublica só o vídeo, sem parar a captura, e publica de novo. Quem assiste
 * assina a nova publicação sozinho (TrackPublished).
 */
export async function republishScreenVideo(
  participant: LocalParticipant,
  stream: MediaStream,
  plan: ScreenPublishPlan
): Promise<void> {
  const [video] = stream.getVideoTracks()
  if (!video || video.readyState !== 'live') return
  const current = participant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack
  if (current) await participant.unpublishTrack(current, false)
  await publishScreenVideo(participant, stream, plan)
}

/** A tela publicada e o que a troca de qualidade precisa dela. */
function publishedScreen(participant: LocalParticipant, stream: MediaStream) {
  const publication = participant.getTrackPublication(Track.Source.ScreenShare)
  const track = publication?.videoTrack
  const video = stream.getVideoTracks()[0]
  const sender = track?.sender
  if (!publication || !track || !video || !sender || track.mediaStreamTrack !== video) return null
  return { publication, track, video, sender }
}

/** Troca bitrate/fps/escala de cada camada; o `active` (do dynacast) fica como está. */
async function setSenderEncodings(sender: RTCRtpSender, encodings: RTCRtpEncodingParameters[]) {
  const parameters = sender.getParameters()
  parameters.encodings.forEach((encoding, index) => Object.assign(encoding, encodings[index]))
  await sender.setParameters(parameters)
}

/**
 * Não despublica: preserva SID, tracks e assinaturas de quem já está assistindo.
 * `connected`: a sala continua conectada (senão a troca é abandonada).
 */
export async function updatePublishedScreenQuality(
  participant: LocalParticipant,
  stream: MediaStream,
  quality: ScreenShareQuality,
  connected: () => boolean,
  /** fps escolhido pela pessoa: um jogo que o controlador desceu para 30 segue 'motion'. */
  chosenFps: ScreenShareQuality['frameRate'] = quality.frameRate
): Promise<void> {
  const screen = publishedScreen(participant, stream)
  const current = (): boolean =>
    connected() &&
    screen?.video.readyState === 'live' &&
    participant.getTrackPublication(Track.Source.ScreenShare) === screen.publication &&
    screen.track.sender === screen.sender
  if (!screen || !current()) throw new Error('screen_not_available')
  const { publication, track, video, sender } = screen
  const previous = video.getConstraints()
  const oldEncodings = sender.getParameters().encodings.map((encoding) => ({ ...encoding }))
  // 1 camada, ou 2 com a camada extra de 720p (por baixo).
  if (oldEncodings.length < 1 || oldEncodings.length > 2)
    throw new Error('unsupported_screen_encodings')
  const encodings = screenSenderEncodings(quality, screenSource(video), oldEncodings.length)
  const encoding = screenEncoding(quality, screenSource(video))
  let encodingApplied = false
  try {
    // applyConstraints substitui as restrições anteriores; Fonte remove width/height.
    await video.applyConstraints(screenVideoConstraints(quality, screenSource(video)))
    if (!current()) throw new Error('screen_changed')
    await setSenderEncodings(sender, encodings)
    encodingApplied = true
    if (!current()) throw new Error('screen_changed')
    // Reconexões internas do SDK também precisam conhecer o novo orçamento.
    track.publishOptions = { ...track.publishOptions, screenShareEncoding: encoding }
    publication.options = { ...publication.options, screenShareEncoding: encoding }
  } catch (error) {
    // Nunca encerra a transmissão caso o browser recuse a alteração.
    if (video.readyState === 'live') await video.applyConstraints(previous).catch(() => {})
    if (encodingApplied && current()) {
      const parameters = sender.getParameters()
      parameters.encodings = oldEncodings
      await sender.setParameters(parameters).catch(() => {})
    }
    throw error
  }
  await applyScreenMotion(video, track, chosenFps)
}

/** Dica de conteúdo pelo fps (jogo 60 = motion, texto 30 = detail); a resolução é mantida. */
async function applyScreenMotion(
  video: MediaStreamTrack,
  track: LocalVideoTrack,
  frameRate: ScreenShareQuality['frameRate']
): Promise<void> {
  const { contentHint, degradationPreference } = screenMotion(frameRate)
  video.contentHint = contentHint
  syncBackupHint(track)
  track.publishOptions = { ...track.publishOptions, degradationPreference }
  // Recusar a preferência não derruba a troca já aplicada.
  await track.setDegradationPreference(degradationPreference).catch(() => {})
}
