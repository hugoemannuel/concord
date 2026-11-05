// H.264 da live na placa de vídeo. No Windows o Chromium só codifica na placa do
// Baseline (42001f) para cima: o Constrained Baseline (42e01f), o primeiro que o
// LiveKit responde, sempre vai para o OpenH264 (processador). O perfil precisa
// estar certo desde a negociação: trocar com a live no ar deixa quem assiste
// sem imagem. O SDK não deixa escolher o perfil nem dá acesso ao transceiver
// antes da oferta (a reserva nasce depois, quando alguém pede), daí o desvio no
// addTransceiver, restrito à tela. Ver docs/adr/0049.

/** Perfil High, um dos dois que o LiveKit aceita (o outro é o 42e01f). */
export const H264_HIGH_CONTENT_TYPE = 'video/H264;profile-level-id=64001f;packetization-mode=1'

const isH264 = (codec: RTCRtpCodec): boolean => codec.mimeType.toLowerCase() === 'video/h264'

const isHigh = ({ sdpFmtpLine = '' }: RTCRtpCodec): boolean =>
  /profile-level-id=64/i.test(sdpFmtpLine) && /packetization-mode=1/.test(sdpFmtpLine)

/** Tira do H.264 o que não é High; sem High no navegador, não mexe. */
export function keepHighH264(codecs: RTCRtpCodec[]): RTCRtpCodec[] {
  if (!codecs.some((codec) => isH264(codec) && isHigh(codec))) return codecs
  return codecs.filter((codec) => !isH264(codec) || isHigh(codec))
}

const isScreenVideo = (track: MediaStreamTrack | string): boolean =>
  typeof track !== 'string' && track.kind === 'video' && !!track.getSettings().displaySurface

function preferHigh(transceiver: RTCRtpTransceiver): void {
  const codecs = globalThis.RTCRtpSender?.getCapabilities('video')?.codecs
  if (!codecs) return
  try {
    transceiver.setCodecPreferences(keepHighH264(codecs))
  } catch {
    /* Sem a preferência a live sai como antes (H.264 no processador). */
  }
}

let highOnly = false
const installed = new WeakSet<object>()

/** Vale para os próximos addTransceiver da tela, incluindo a reserva criada depois. */
export function installHighH264Offer(target: Pick<RTCPeerConnection, 'addTransceiver'>): void {
  if (installed.has(target)) return
  installed.add(target)
  const original = target.addTransceiver
  target.addTransceiver = function (
    this: RTCPeerConnection,
    track: MediaStreamTrack | string,
    init?: RTCRtpTransceiverInit
  ): RTCRtpTransceiver {
    const transceiver = original.call(this, track, init)
    if (highOnly && isScreenVideo(track)) preferHigh(transceiver)
    return transceiver
  }
}

/** A live vai pedir o H.264 só no High? (ver needsHighH264) */
export function requireHighH264(on: boolean): void {
  highOnly = on
  const prototype = globalThis.RTCPeerConnection?.prototype
  if (on && prototype) installHighH264Offer(prototype)
}
