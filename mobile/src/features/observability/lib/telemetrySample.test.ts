import type { ScreenStatsInput } from '../../call/lib/callStatsSource'
import { shareSample, transportOf, watchSample } from './telemetrySample'
import { statsReport as report } from './testReport'

const iceUdp = {
  t1: { type: 'transport', selectedCandidatePairId: 'p1' },
  p1: { type: 'candidate-pair', localCandidateId: 'l1', currentRoundTripTime: 0.04 },
  l1: { type: 'local-candidate', protocol: 'udp', candidateType: 'host' }
}

function shareInput(extra: Record<string, unknown>, more: Record<string, Record<string, unknown>> = {}): ScreenStatsInput {
  return {
    streamState: 'active',
    requestedFps: 15,
    report: report({
      ...iceUdp,
      c1: { type: 'codec', mimeType: 'video/VP8' },
      o1: {
        type: 'outbound-rtp',
        kind: 'video',
        codecId: 'c1',
        timestamp: 20_000,
        bytesSent: 10_000_000,
        framesPerSecond: 14.6,
        frameWidth: 720,
        frameHeight: 1600,
        encoderImplementation: 'c2.exynos.vp8.encoder',
        qualityLimitationReason: 'bandwidth',
        keyFramesEncoded: 12,
        pliCount: 5,
        firCount: 1,
        nackCount: 40,
        ...extra
      },
      o2: { type: 'outbound-rtp', kind: 'video', codecId: 'c1', bytesSent: 100, frameHeight: 400 },
      ...more
    })
  }
}

describe('shareSample (a minha tela no celular)', () => {
  it('resume o envio: codec, placa pelo nome do MediaCodec, alvo pedido, camadas', () => {
    const { sample } = shareSample(shareInput({}), null)!
    expect(sample).toMatchObject({
      codec: 'VP8',
      hardware: true,
      width: 720,
      height: 1600,
      fps: 14.6,
      target_fps: 15,
      target_height: null,
      limitation: 'bandwidth',
      step: null,
      layers: 2,
      backup: null,
      transport: 'udp',
      rtt_ms: 40
    })
  })

  it('contadores e taxa como diferença desde a leitura anterior', () => {
    const first = shareSample(shareInput({}), null)!
    const next = shareSample(shareInput({ timestamp: 40_000, bytesSent: 22_500_000, keyFramesEncoded: 15, pliCount: 7, nackCount: 41 }), first.counters)!
    expect(next.sample).toMatchObject({ seconds: 20, bitrate_kbps: 5000, key_frames: 3, pli: 2, nack: 1 })
    expect(first.sample.bitrate_kbps).toBeNull()
  })

  it('captura, fps codificado no intervalo e ms por quadro', () => {
    const at = (extra: Record<string, unknown>, frames: number): ScreenStatsInput =>
      shareInput({ mediaSourceId: 'm1', ...extra }, { m1: { type: 'media-source', kind: 'video', frames, framesPerSecond: 15 } })
    const first = shareSample(at({ framesEncoded: 1000, totalEncodeTime: 5 }, 1200), null)!
    expect(first.sample).toMatchObject({ fps: 14.6, capture_fps: 15, codec_ms: null })
    const next = shareSample(at({ timestamp: 40_000, framesEncoded: 1240, totalEncodeTime: 6.2 }, 1500), first.counters)!
    expect(next.sample).toMatchObject({ fps: 12, capture_fps: 15, codec_ms: 5 })
  })

  it('codificador de software do Android e sem envio', () => {
    expect(shareSample(shareInput({ encoderImplementation: 'libvpx' }), null)!.sample.hardware).toBe(false)
    expect(shareSample({ ...shareInput({}), report: report({}) }, null)).toBeNull()
  })
})

function watchInput(extra: Record<string, unknown>, streamState = 'active'): ScreenStatsInput {
  return {
    streamState,
    requestedFps: null,
    report: report({
      t1: { type: 'transport', selectedCandidatePairId: 'p1' },
      p1: { type: 'candidate-pair', localCandidateId: 'l1' },
      l1: { type: 'local-candidate', protocol: 'tcp', candidateType: 'host' },
      c1: { type: 'codec', mimeType: 'video/H264' },
      i1: {
        type: 'inbound-rtp',
        kind: 'video',
        codecId: 'c1',
        timestamp: 10_000,
        bytesReceived: 1_000_000,
        framesPerSecond: 29.7,
        frameHeight: 1080,
        decoderImplementation: 'c2.android.avc.decoder',
        packetsLost: 10,
        packetsReceived: 990,
        jitter: 0.012,
        freezeCount: 1,
        totalFreezesDuration: 0.5,
        framesDropped: 4,
        ...extra
      }
    })
  }
}

describe('watchSample (assistindo no celular)', () => {
  it('resume a recepção (a primeira leitura é a base)', () => {
    expect(watchSample(watchInput({}), null)!.sample).toMatchObject({
      codec: 'H264',
      hardware: false,
      height: 1080,
      fps: 29.7,
      loss_pct: null,
      jitter_ms: 12,
      freezes: 0,
      transport: 'tcp',
      paused: false
    })
  })

  it('no intervalo: perda, congelamentos, quadros que chegaram × decodificados', () => {
    const first = watchSample(watchInput({ framesReceived: 900, framesDecoded: 880, totalDecodeTime: 2 }), null)!
    const { sample } = watchSample(
      watchInput({ timestamp: 30_000, packetsLost: 30, packetsReceived: 1970, freezeCount: 3, totalFreezesDuration: 3, framesReceived: 1780, framesDecoded: 1120, totalDecodeTime: 2.6 }),
      first.counters
    )!
    expect(sample).toMatchObject({ seconds: 20, loss_pct: 2, freezes: 2, freeze_ms: 2500, frames_dropped: 0, fps: 12, recv_fps: 44, codec_ms: 2.5 })
  })

  it('pausada pelo servidor; sem recepção ainda: null', () => {
    expect(watchSample(watchInput({}, 'paused'), null)!.sample.paused).toBe(true)
    expect(watchSample({ ...watchInput({}), report: report({}) }, null)).toBeNull()
  })
})

describe('transportOf', () => {
  it('sem transporte selecionado: o par indicado e bem-sucedido; TURN vira relay', () => {
    const r = report({
      p1: { type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'l1' },
      l1: { type: 'local-candidate', protocol: 'udp', candidateType: 'relay' }
    })
    expect(transportOf(r)).toBe('relay')
    expect(transportOf(report({}))).toBe('')
  })
})
