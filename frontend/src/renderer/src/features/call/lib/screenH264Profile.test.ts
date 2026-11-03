import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  H264_HIGH_CONTENT_TYPE,
  installHighH264Offer,
  keepHighH264,
  requireHighH264
} from './screenH264Profile'

const codec = (mimeType: string, sdpFmtpLine?: string): RTCRtpCodec =>
  ({ mimeType, clockRate: 90000, sdpFmtpLine }) as RTCRtpCodec

const HIGH = codec('video/H264', 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640032')
const HIGH_MODE0 = codec('video/H264', 'packetization-mode=0;profile-level-id=64001f')
const BASELINE = codec('video/H264', 'packetization-mode=1;profile-level-id=42e01f')
const MAIN = codec('video/H264', 'packetization-mode=1;profile-level-id=4d001f')
const H265 = codec('video/H265', 'level-id=123')
const RTX = codec('video/rtx', 'apt=96')
const CAPS = [BASELINE, MAIN, HIGH_MODE0, HIGH, H265, RTX]

function fakePeerConnection() {
  const transceiver = { setCodecPreferences: vi.fn() }
  const original = vi.fn(() => transceiver)
  const proto = { addTransceiver: original } as unknown as RTCPeerConnection
  installHighH264Offer(proto)
  return { proto, transceiver, original }
}

const screenTrack = {
  kind: 'video',
  getSettings: () => ({ displaySurface: 'window' })
} as unknown as MediaStreamTrack
const cameraTrack = { kind: 'video', getSettings: () => ({}) } as unknown as MediaStreamTrack
const screenAudio = {
  kind: 'audio',
  getSettings: () => ({ displaySurface: 'window' })
} as unknown as MediaStreamTrack

beforeEach(() => {
  vi.stubGlobal('RTCRtpSender', { getCapabilities: () => ({ codecs: CAPS, headerExtensions: [] }) })
  requireHighH264(true)
})
afterEach(() => {
  requireHighH264(false)
  vi.unstubAllGlobals()
})

describe('keepHighH264', () => {
  it('regressão: o H.264 da tela só no High (o Constrained Baseline vai para o processador)', () => {
    expect(keepHighH264(CAPS)).toEqual([HIGH, H265, RTX])
  })

  it('sem High no navegador: não mexe (senão a live ficaria sem H.264)', () => {
    expect(keepHighH264([BASELINE, H265])).toEqual([BASELINE, H265])
  })
})

describe('H264_HIGH_CONTENT_TYPE', () => {
  it('pergunta o perfil que o LiveKit aceita, como o WebRTC publica', () => {
    expect(H264_HIGH_CONTENT_TYPE).toBe('video/H264;profile-level-id=64001f;packetization-mode=1')
  })
})

describe('installHighH264Offer', () => {
  it('a tela oferece o H.264 só no High desde a negociação (trocar depois deixa a imagem preta)', () => {
    const { proto, transceiver, original } = fakePeerConnection()
    const init = { direction: 'sendonly' } as RTCRtpTransceiverInit
    expect(proto.addTransceiver(screenTrack, init)).toBe(transceiver)
    expect(original).toHaveBeenCalledWith(screenTrack, init)
    expect(transceiver.setCodecPreferences).toHaveBeenCalledWith([HIGH, H265, RTX])
  })

  it('câmera, som da tela e pedido só pelo tipo não mudam', () => {
    const { proto, transceiver } = fakePeerConnection()
    proto.addTransceiver(cameraTrack)
    proto.addTransceiver(screenAudio)
    proto.addTransceiver('video')
    expect(transceiver.setCodecPreferences).not.toHaveBeenCalled()
  })

  it('placa que já codifica o Baseline (ou sem placa): segue o padrão', () => {
    const { proto, transceiver } = fakePeerConnection()
    requireHighH264(false)
    proto.addTransceiver(screenTrack)
    expect(transceiver.setCodecPreferences).not.toHaveBeenCalled()
  })

  it('o navegador recusar as preferências não derruba a publicação', () => {
    const { proto, transceiver } = fakePeerConnection()
    transceiver.setCodecPreferences.mockImplementation(() => {
      throw new Error('InvalidModificationError')
    })
    expect(proto.addTransceiver(screenTrack)).toBe(transceiver)
  })

  it('instalar duas vezes não empilha o desvio', () => {
    const { proto, transceiver } = fakePeerConnection()
    installHighH264Offer(proto)
    proto.addTransceiver(screenTrack)
    expect(transceiver.setCodecPreferences).toHaveBeenCalledTimes(1)
  })
})
