// Captura de mídia local. O transporte (envio/recebimento) fica no LiveKit —
// ver lib/livekit.ts.

import { openMicrophone, type MicHandle } from './noiseSuppression'
import { pickerError, resetPickerCancel } from './screenPickerCancel'
import {
  displayMediaOptions,
  portalPickerError,
  retryWithoutAudio,
  ScreenShareSetupError,
  usesNativePicker
} from './displayMedia'
import { IS_WEB } from '../../../shared/lib/config'
import { requestScreenQuality } from '../store/screenQualityStore'
import { notePickerFailure } from './screenStartTelemetry'
import {
  loadScreenQuality,
  rememberScreenSource,
  rememberStreamQuality,
  screenMotion,
  screenVideoConstraints,
  type ScreenShareQuality
} from './screenShareQuality'

/** Microfone local (com RNNoise). `deviceId` vazio = padrão do sistema. */
export function getAudioStream(deviceId = ''): Promise<MicHandle> {
  return openMicrophone(deviceId)
}

// Captura de tela com o som do que está sendo compartilhado. No desktop o
// picker visual é o modal do app — o Electron resolve a fonte escolhida via
// setDisplayMediaRequestHandler no processo main. No navegador, o seletor é o
// do próprio navegador (ver lib/displayMedia.ts). Rejeita com NotAllowedError
// quando o usuário cancela.
// Linux/Wayland: o seletor é o do sistema (xdg-desktop-portal), como na web;
// o som não vai junto (o Electron só captura o som do sistema no Windows).
/**
 * Seletor do sistema (portal no Linux, ou o navegador): confere o portal e
 * pergunta a qualidade antes, num modal do app. null = o seletor é o modal
 * do app, que escolhe a qualidade junto com a fonte.
 */
export async function askScreenQuality(): Promise<ScreenShareQuality | null> {
  const flow = window.api?.screenShare?.flow
  if (flow === 'portal') {
    const { status, message } = await window.api!.screenShare!.portalStatus()
    if (status === 'missing') throw new ScreenShareSetupError(message)
  }
  return usesNativePicker(IS_WEB, flow) ? requestScreenQuality() : null
}

/** `asked`: a qualidade já perguntada por askScreenQuality (undefined = pergunta aqui). */
export async function getDisplayStream(
  asked?: ScreenShareQuality | null
): Promise<MediaStream> {
  resetPickerCancel()
  const portal = window.api?.screenShare?.flow === 'portal'
  const requestedQuality = asked === undefined ? await askScreenQuality() : asked
  const capture = (audio: boolean): Promise<MediaStream> =>
    navigator.mediaDevices.getDisplayMedia(
      displayMediaOptions(IS_WEB, {
        audio,
        frameRate: requestedQuality?.frameRate ?? 60
      })
    )
  const stream = await capture(!portal)
    .catch((err: unknown) => {
      // Navegador sem captura de som de tela: compartilha só o vídeo.
      if (IS_WEB && retryWithoutAudio(err)) return capture(false)
      throw err
    })
    .catch((err: unknown) => {
      const error = portal ? portalPickerError(err) : pickerError(err)
      notePickerFailure(error)
      throw error
    })
  const quality = requestedQuality ?? loadScreenQuality()
  stream.getVideoTracks().forEach(rememberScreenSource)
  try {
    await Promise.all(
      stream
        .getVideoTracks()
        .map((track) =>
          track.applyConstraints(screenVideoConstraints(quality, track.getSettings()))
        )
    )
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop())
    window.api?.screenShare?.ended()
    throw err
  }
  rememberStreamQuality(stream, quality)
  stream.getVideoTracks().forEach((track) => {
    // 60 fps (jogo) = 'motion'; 30 fps (texto) = 'detail'. Ver screenMotion.
    track.contentHint = screenMotion(quality.frameRate).contentHint
    track.addEventListener('ended', () => window.api?.screenShare?.ended())
  })
  stream.getAudioTracks().forEach((track) => {
    track.contentHint = 'music'
  })
  return stream
}

// Câmera local. Só vídeo — o microfone já vem de getAudioStream(). `deviceId`
// '' = padrão do sistema; se a câmera escolhida sumiu, abre a padrão.
export async function getCameraStream(deviceId = ''): Promise<MediaStream> {
  const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { ...video, deviceId: { exact: deviceId } } : video,
      audio: false
    })
  } catch (err) {
    const gone = (err as DOMException)?.name === 'OverconstrainedError'
    if (!deviceId || !gone) throw err
    stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
  }
  stream.getVideoTracks().forEach((track) => {
    track.contentHint = 'motion'
  })
  return stream
}
