import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('livekit-client', () => ({
  AudioPresets: { musicHighQualityStereo: {} },
  BackupCodecPolicy: { SIMULCAST: 1 },
  Track: { Source: { ScreenShare: 'screen_share', ScreenShareAudio: 'screen_share_audio' } },
  VideoPreset: class {
    constructor(
      public width: number,
      public height: number,
      public maxBitrate: number,
      public maxFramerate: number
    ) {}
  }
}))

import type { LocalParticipant } from 'livekit-client'
import { ScreenSender } from './screenSender'
import { takeScreenCodecChoice } from './screenCodecChoice'
import { ADAPT } from './screenAdaptController'
import { rememberScreenSource, rememberStreamQuality } from './screenShareQuality'
import { SIMULCAST_KEY } from './screenSimulcast'
import { clearScreenCodecCache } from './screenCodecSupport'
import type { ScreenAdaptView } from '../store/screenAdaptStore'

const limited = new Map([
  [
    'o1',
    {
      id: 'o1',
      type: 'outbound-rtp',
      kind: 'video',
      bytesSent: 1,
      qualityLimitationReason: 'bandwidth'
    }
  ]
])

/** Codecs que a placa de vídeo codifica (o resto, só o processador). */
type Card = { av1?: boolean; h265?: boolean; h264?: boolean }

function setup(options: Card & { storage?: Record<string, string> } = {}) {
  const data = new Map(Object.entries(options.storage ?? {}))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v)
  })
  vi.stubGlobal('RTCRtpSender', {
    getCapabilities: () => ({
      codecs: ['video/H264', 'video/AV1', ...(options.h265 ? ['video/H265'] : [])].map(
        (mimeType) => ({ mimeType })
      )
    })
  })
  const hardware: Record<string, boolean> = {
    'video/H264': !!options.h264,
    'video/AV1': !!options.av1,
    'video/H265': !!options.h265
  }
  vi.stubGlobal('navigator', {
    mediaCapabilities: {
      encodingInfo: async ({ video }: { video: { contentType: string } }) => ({
        supported: true,
        powerEfficient: !!hardware[video.contentType]
      })
    }
  })
  const video = {
    readyState: 'live',
    getSettings: () => ({ width: 1920, height: 1080 }),
    getConstraints: () => ({}),
    applyConstraints: vi.fn(async () => {}),
    contentHint: ''
  }
  rememberScreenSource(video as unknown as MediaStreamTrack)
  let parameters = { encodings: [{ maxBitrate: 7_000_000, maxFramerate: 60, active: true }] }
  const sender = {
    getParameters: () => structuredClone(parameters),
    setParameters: vi.fn(async (next) => {
      parameters = next
    })
  }
  const track = {
    mediaStreamTrack: video,
    sender,
    publishOptions: {},
    getRTCStatsReport: vi.fn(async () => limited),
    setDegradationPreference: vi.fn(async () => {}),
    simulcastCodecs: new Map(),
    setSimulcastTrackSender: vi.fn(async () => {})
  }
  const publication = { videoTrack: track, options: {} }
  const participant = {
    publishTrack: vi.fn(async () => publication),
    getTrackPublication: vi.fn(() => publication)
  }
  const stream = {
    getVideoTracks: () => [video],
    getAudioTracks: () => []
  } as unknown as MediaStream
  rememberStreamQuality(stream, { resolution: '1080p', frameRate: 60 })
  const views: (ScreenAdaptView | null)[] = []
  const screen = new ScreenSender(
    participant as unknown as LocalParticipant,
    () => true,
    (view) => views.push(view)
  )
  return { screen, participant, stream, sender, views, video, track }
}

beforeEach(() => {
  vi.useFakeTimers()
  clearScreenCodecCache()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ScreenSender', () => {
  it('placa de vídeo com AV1: publica AV1 com H.264 de reserva, mantendo a resolução', async () => {
    const { screen, participant, stream, video } = setup({ av1: true })
    await screen.publish(stream)
    expect(participant.publishTrack).toHaveBeenCalledWith(video, {
      source: 'screen_share',
      name: 'screen',
      simulcast: false,
      screenShareEncoding: { maxBitrate: 7_000_000, maxFramerate: 60 },
      videoCodec: 'av1',
      backupCodec: { codec: 'h264' },
      backupCodecPolicy: 1,
      degradationPreference: 'maintain-resolution'
    })
    screen.stop()
  })

  it('placa sem AV1 e com H.265: publica H.265 com H.264 de reserva', async () => {
    const { screen, participant, stream } = setup({ h265: true })
    await screen.publish(stream)
    expect(participant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoCodec: 'h265', backupCodec: { codec: 'h264' } })
    )
    screen.stop()
  })

  it('anota por que saiu nesse codec (telemetria)', async () => {
    const { screen, stream } = setup({ h265: true })
    takeScreenCodecChoice()
    await screen.publish(stream)
    expect(takeScreenCodecChoice()).toBe(
      'auto: h265 + h264 | av1 proc., h265 placa, h264 proc. | 720p extra | som: nenhum'
    )
    screen.stop()
  })

  it('sem AV1 nem H.265 por hardware: H.264 com VP8 de reserva', async () => {
    const { screen, participant, stream } = setup()
    await screen.publish(stream)
    expect(participant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoCodec: 'h264', backupCodec: { codec: 'vp8' } })
    )
    screen.stop()
  })

  it('camada extra de 720p marcada: duas camadas e H.264 (pula o AV1)', async () => {
    const { screen, participant, stream } = setup({ av1: true, storage: { [SIMULCAST_KEY]: '1' } })
    await screen.publish(stream)
    expect(participant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        simulcast: true,
        videoCodec: 'h264',
        screenShareSimulcastLayers: [
          expect.objectContaining({ width: 1280, height: 720, maxBitrate: 3_000_000 })
        ]
      })
    )
    screen.stop()
  })

  it('Automático: H.264 na placa de vídeo e 1080p → liga a camada de 720p', async () => {
    const { screen, participant, stream } = setup({ h264: true })
    await screen.publish(stream)
    expect(participant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ simulcast: true, videoCodec: 'h264' })
    )
    screen.stop()
  })

  it('Automático: H.264 no processador → uma camada só', async () => {
    const { screen, participant, stream } = setup()
    await screen.publish(stream)
    expect(participant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ simulcast: false })
    )
    screen.stop()
  })

  it('Automático com AV1 na placa: fica o AV1, sem a camada extra', async () => {
    const { screen, participant, stream } = setup({ av1: true, h264: true })
    await screen.publish(stream)
    expect(participant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ simulcast: false, videoCodec: 'av1' })
    )
    screen.stop()
  })

  it('Desligada respeitada mesmo com H.264 na placa de vídeo', async () => {
    const { screen, participant, stream } = setup({ h264: true, storage: { [SIMULCAST_KEY]: '0' } })
    await screen.publish(stream)
    expect(participant.publishTrack).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ simulcast: false })
    )
    screen.stop()
  })

  it('envio limitado: o controlador desce 1080p60 → 720p60 ao vivo e conta para a UI', async () => {
    const { screen, stream, sender, views, video } = setup()
    await screen.publish(stream)
    expect(views.at(-1)).toMatchObject({ effective: '1080p 60', reduced: false })
    await vi.advanceTimersByTimeAsync(ADAPT.tickMs * (ADAPT.startHold + ADAPT.downAfter))
    expect(video.applyConstraints).toHaveBeenLastCalledWith({
      width: { max: 1280 },
      height: { max: 720 },
      frameRate: { ideal: 60, max: 60 }
    })
    expect(sender.getParameters().encodings[0]).toMatchObject({ maxBitrate: 4_500_000 })
    expect(views.at(-1)).toEqual({
      chosen: '1080p 60',
      effective: '720p 60',
      reduced: true,
      reason: 'bandwidth',
      step: 1
    })
    expect(screen.current()).toEqual(views.at(-1))
    screen.stop()
  })

  it('reserva sofrendo não derruba o principal: o controlador só lê o envio principal', async () => {
    const { screen, stream, views, track, video } = setup()
    const healthy = new Map([
      ['o1', { id: 'o1', type: 'outbound-rtp', kind: 'video', bytesSent: 1 }]
    ])
    const backupLimited = new Map([
      [
        'o2',
        {
          id: 'o2',
          type: 'outbound-rtp',
          kind: 'video',
          bytesSent: 10,
          qualityLimitationReason: 'cpu'
        }
      ]
    ])
    track.getRTCStatsReport.mockResolvedValue(healthy as never)
    track.simulcastCodecs.set('h264', { sender: { getStats: async () => backupLimited } })
    await screen.publish(stream)
    await vi.advanceTimersByTimeAsync(ADAPT.tickMs * (ADAPT.startHold + ADAPT.downAfter))
    expect(video.applyConstraints).not.toHaveBeenCalled()
    expect(views.at(-1)).toMatchObject({ effective: '1080p 60', reduced: false })
    screen.stop()
  })

  it('conta a quem assiste o codificador real: H.265 na placa e o degrau saindo', async () => {
    const { screen, stream, track } = setup({ h265: true })
    expect(await screen.encoderInfo()).toEqual({ quality: null, encoders: [] })
    await screen.publish(stream)
    track.getRTCStatsReport.mockResolvedValue(
      new Map<string, Record<string, unknown>>([
        ['c1', { id: 'c1', type: 'codec', mimeType: 'video/H265' }],
        [
          'o1',
          {
            id: 'o1',
            type: 'outbound-rtp',
            kind: 'video',
            codecId: 'c1',
            frameHeight: 1080,
            framesPerSecond: 60,
            powerEfficientEncoder: true
          }
        ]
      ]) as never
    )
    expect(await screen.encoderInfo()).toEqual({
      quality: '1080p 60',
      encoders: [{ codec: 'H265', hardware: true, height: 1080, fps: 60, backup: false }]
    })
    screen.stop()
  })

  it('jogo (60 fps) que desceu para 30 continua com a dica de movimento', async () => {
    const { screen, stream, video, views } = setup()
    rememberStreamQuality(stream, { resolution: '720p', frameRate: 60 })
    await screen.publish(stream)
    await vi.advanceTimersByTimeAsync(ADAPT.tickMs * (ADAPT.startHold + ADAPT.downAfter))
    expect(views.at(-1)).toMatchObject({ effective: '720p 30', reduced: true })
    // 'detail' no OpenH264 liga o modo de tela, que solta quadros de jogo.
    expect(video.contentHint).toBe('motion')
    screen.stop()
  })

  it('a pessoa troca a qualidade: aplica e recomeça do novo escolhido', async () => {
    const { screen, stream, views } = setup()
    await screen.publish(stream)
    await screen.update(stream, { resolution: '720p', frameRate: 30 })
    expect(views.at(-1)).toMatchObject({ chosen: '720p 30', effective: '720p 30', reduced: false })
    screen.stop()
  })

  it('parar outra transmissão não mexe; parar a minha desliga o controlador e limpa o aviso', async () => {
    const { screen, stream, views, participant } = setup()
    await screen.publish(stream)
    screen.stop({} as MediaStream)
    expect(views.at(-1)).not.toBeNull()
    screen.stop(stream)
    expect(views.at(-1)).toBeNull()
    const reads = participant.getTrackPublication.mock.calls.length
    await vi.advanceTimersByTimeAsync(ADAPT.tickMs * 3)
    expect(participant.getTrackPublication.mock.calls.length).toBe(reads)
  })
})
