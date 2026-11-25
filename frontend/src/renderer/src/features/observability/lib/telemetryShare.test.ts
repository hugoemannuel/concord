import { describe, expect, it } from 'vitest'
import type { ScreenStatsInput } from '../../call/lib/screenStats'
import { shareSample } from './telemetryShare'

const report = (stats: Record<string, Record<string, unknown>>): RTCStatsReport =>
  new Map(Object.entries(stats).map(([id, s]) => [id, { id, ...s }])) as unknown as RTCStatsReport

const iceUdp = {
  t1: { type: 'transport', selectedCandidatePairId: 'p1' },
  p1: { type: 'candidate-pair', localCandidateId: 'l1', currentRoundTripTime: 0.04 },
  l1: { type: 'local-candidate', protocol: 'udp', candidateType: 'host' }
}

function shareInput(
  extra: Record<string, unknown>,
  quality?: ScreenStatsInput['quality']
): ScreenStatsInput {
  return {
    local: true,
    enabled: true,
    streamState: 'active',
    requestedFps: 60,
    quality,
    report: report({
      ...iceUdp,
      c1: { type: 'codec', mimeType: 'video/H265' },
      c2: { type: 'codec', mimeType: 'video/H264' },
      o1: {
        type: 'outbound-rtp',
        kind: 'video',
        codecId: 'c1',
        timestamp: 20_000,
        bytesSent: 10_000_000,
        framesPerSecond: 44.6,
        frameWidth: 1280,
        frameHeight: 720,
        encoderImplementation: 'MediaFoundationVideoEncodeAccelerator',
        powerEfficientEncoder: true,
        qualityLimitationReason: 'cpu',
        keyFramesEncoded: 12,
        pliCount: 5,
        firCount: 1,
        nackCount: 40,
        ...extra
      },
      o2: { type: 'outbound-rtp', kind: 'video', codecId: 'c1', bytesSent: 100, frameHeight: 360 },
      o3: { type: 'outbound-rtp', kind: 'video', codecId: 'c2', bytesSent: 50, frameHeight: 720 }
    })
  }
}

const adapt = {
  chosen: '1080p 60',
  effective: '720p 60',
  reduced: true,
  reason: 'cpu' as const,
  step: 1
}

describe('shareSample', () => {
  it('resume o envio: codec, placa, real × alvo, degrau, camadas e reserva', () => {
    const { sample } = shareSample(shareInput({}, adapt), null, 2)!
    expect(sample).toMatchObject({
      codec: 'H265',
      hardware: true,
      width: 1280,
      height: 720,
      fps: 44.6,
      target_height: 1080,
      target_fps: 60,
      limitation: 'cpu',
      step: 1,
      step_changes: 2,
      layers: 2,
      backup: true,
      transport: 'udp',
      rtt_ms: 40,
      paused: false
    })
  })

  it('contadores e taxa como diferença desde a leitura anterior', () => {
    const first = shareSample(shareInput({}), null, 0)!
    const next = shareSample(
      shareInput({
        timestamp: 40_000,
        bytesSent: 22_500_000,
        keyFramesEncoded: 15,
        pliCount: 7,
        nackCount: 41
      }),
      first.counters,
      0
    )!
    expect(next.sample).toMatchObject({
      seconds: 20,
      bitrate_kbps: 5000,
      key_frames: 3,
      pli: 2,
      nack: 1
    })
    expect(first.sample.seconds).toBe(0)
    expect(first.sample.bitrate_kbps).toBeNull()
  })

  it('onde os quadros se perdem: captura, fps codificado no intervalo e ms por quadro', () => {
    const source = {
      m1: { type: 'media-source', kind: 'video', frames: 1200, framesPerSecond: 58 }
    }
    const at = (extra: Record<string, unknown>, frames: number): ScreenStatsInput => {
      const input = shareInput({ mediaSourceId: 'm1', ...extra })
      const stats = new Map(input.report as unknown as Map<string, unknown>)
      stats.set('m1', { id: 'm1', ...source.m1, frames })
      return { ...input, report: stats as unknown as RTCStatsReport }
    }
    const first = shareSample(at({ framesEncoded: 1000, totalEncodeTime: 5 }, 1200), null, 0)!
    expect(first.sample).toMatchObject({ fps: 44.6, capture_fps: 58, codec_ms: null })
    const next = shareSample(
      at({ timestamp: 40_000, framesEncoded: 1840, totalEncodeTime: 9.2 }, 2100),
      first.counters,
      0
    )!
    expect(next.sample).toMatchObject({ fps: 42, capture_fps: 45, codec_ms: 5 })
  })

  it('contador de quadros que voltou (troca de camada): fps do momento', () => {
    const first = shareSample(shareInput({ framesEncoded: 5000 }), null, 0)!
    const next = shareSample(
      shareInput({ timestamp: 40_000, framesEncoded: 300 }),
      first.counters,
      0
    )!
    expect(next.sample.fps).toBe(44.6)
  })

  it('leva o motivo do controlador para o evento de degrau (fora da amostra)', () => {
    const bandwidth = { ...adapt, reason: 'bandwidth' as const }
    const result = shareSample(shareInput({ qualityLimitationReason: 'none' }, bandwidth), null, 0)!
    expect(result.stepReason).toBe('bandwidth')
    expect(result.sample).not.toHaveProperty('stepReason')
    expect(shareSample(shareInput({}), null, 0)!.stepReason).toBeNull()
  })

  it('sem o controlador: alvo pelo fps pedido, degrau vazio', () => {
    const { sample } = shareSample(
      shareInput({ powerEfficientEncoder: false, encoderImplementation: 'OpenH264' }),
      null,
      0
    )!
    expect(sample).toMatchObject({
      target_fps: 60,
      target_height: null,
      step: null,
      hardware: false
    })
  })

  it('QP médio do intervalo e a perda e o jitter da subida (o que o servidor diz que recebeu)', () => {
    const withRemote = (
      extra: Record<string, unknown>,
      lost: number,
      jitter: number
    ): ScreenStatsInput => {
      const input = shareInput(extra)
      const stats = new Map(input.report as unknown as Map<string, unknown>)
      stats.set('r1', {
        id: 'r1',
        type: 'remote-inbound-rtp',
        kind: 'video',
        localId: 'o1',
        packetsLost: lost,
        jitter
      })
      stats.set('r2', {
        id: 'r2',
        type: 'remote-inbound-rtp',
        kind: 'video',
        localId: 'o2',
        packetsLost: 999
      })
      return { ...input, report: stats as unknown as RTCStatsReport }
    }
    const first = shareSample(
      withRemote({ framesEncoded: 1000, qpSum: 30_000, packetsSent: 1000 }, 10, 0.01),
      null,
      0
    )!
    expect(first.sample).toMatchObject({ qp: null, loss_pct: null, jitter_ms: 10 })
    const next = shareSample(
      withRemote(
        { timestamp: 40_000, framesEncoded: 1600, qpSum: 48_600, packetsSent: 2000 },
        30,
        0.015
      ),
      first.counters,
      0
    )!
    expect(next.sample).toMatchObject({ qp: 31, loss_pct: 2, jitter_ms: 15 })
  })

  it('regressão: o envio principal trocou de camada (outro ssrc): sem perda naquele intervalo', () => {
    const at = (t: number, ssrc: number, sent: number, lost: number): ScreenStatsInput => {
      const input = shareInput({ timestamp: t, ssrc, packetsSent: sent })
      const stats = new Map(input.report as unknown as Map<string, unknown>)
      stats.set('r1', {
        id: 'r1',
        type: 'remote-inbound-rtp',
        kind: 'video',
        localId: 'o1',
        packetsLost: lost
      })
      return { ...input, report: stats as unknown as RTCStatsReport }
    }
    const first = shareSample(at(20_000, 111, 50_000, 10), null, 0)!
    expect(shareSample(at(40_000, 222, 1000, 400), first.counters, 0)!.sample.loss_pct).toBeNull()
  })

  it('sem qpSum nem remote-inbound-rtp: QP, perda e jitter vazios', () => {
    const first = shareSample(shareInput({ framesEncoded: 10 }), null, 0)!
    const next = shareSample(
      shareInput({ timestamp: 40_000, framesEncoded: 20 }),
      first.counters,
      0
    )!
    expect(next.sample).toMatchObject({ qp: null, loss_pct: null, jitter_ms: null })
  })

  it('a fonte da live (tamanho antes de reduzir e o tipo) e o nome do codificador', () => {
    const source = { width: 2560, height: 1440, surface: 'monitor' }
    const result = shareSample({ ...shareInput({}), source }, null, 0)!
    expect(result.sample).toMatchObject({
      source_width: 2560,
      source_height: 1440,
      surface: 'monitor'
    })
    expect(result.implementation).toBe('MediaFoundationVideoEncodeAccelerator')
    expect(shareSample(shareInput({}), null, 0)!.sample.surface).toBeNull()
  })

  it('sem envio de vídeo: null', () => {
    expect(shareSample({ ...shareInput({}), report: report({}) }, null, 0)).toBeNull()
  })
})
