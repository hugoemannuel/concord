import { describe, expect, it } from 'vitest'
import type { ScreenStatsInput } from '../../call/lib/screenStats'
import { transportOf, watchSample } from './telemetrySample'

const report = (stats: Record<string, Record<string, unknown>>): RTCStatsReport =>
  new Map(Object.entries(stats).map(([id, s]) => [id, { id, ...s }])) as unknown as RTCStatsReport

function watchInput(extra: Record<string, unknown>, streamState = 'active'): ScreenStatsInput {
  return {
    local: false,
    enabled: true,
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
        frameWidth: 1920,
        frameHeight: 1080,
        decoderImplementation: 'FFmpeg',
        packetsLost: 10,
        packetsReceived: 990,
        jitter: 0.012,
        freezeCount: 1,
        totalFreezesDuration: 0.5,
        framesDropped: 4,
        keyFramesDecoded: 2,
        pliCount: 1,
        nackCount: 3,
        ...extra
      }
    })
  }
}

describe('watchSample', () => {
  it('resume a recepção (a primeira leitura é a base: contadores zerados)', () => {
    const { sample } = watchSample(watchInput({}), null)!
    expect(sample).toMatchObject({
      codec: 'H264',
      hardware: false,
      height: 1080,
      fps: 29.7,
      loss_pct: null,
      jitter_ms: 12,
      freezes: 0,
      freeze_ms: 0,
      frames_dropped: 0,
      transport: 'tcp',
      paused: false,
      target_fps: null
    })
  })

  it('no intervalo: perda e congelamentos novos', () => {
    const first = watchSample(watchInput({}), null)!
    const { sample } = watchSample(
      watchInput({
        timestamp: 30_000,
        packetsLost: 30,
        packetsReceived: 1970,
        freezeCount: 3,
        totalFreezesDuration: 3.0,
        framesDropped: 4
      }),
      first.counters
    )!
    expect(sample).toMatchObject({
      seconds: 20,
      loss_pct: 2,
      freezes: 2,
      freeze_ms: 2500,
      frames_dropped: 0
    })
  })

  it('quadros que chegaram × decodificados e ms por quadro no decodificador', () => {
    const first = watchSample(
      watchInput({ framesReceived: 900, framesDecoded: 880, totalDecodeTime: 2 }),
      null
    )!
    expect(first.sample).toMatchObject({ fps: 29.7, recv_fps: null, codec_ms: null })
    const { sample } = watchSample(
      watchInput({
        timestamp: 30_000,
        framesReceived: 1780,
        framesDecoded: 1120,
        totalDecodeTime: 2.6
      }),
      first.counters
    )!
    expect(sample).toMatchObject({ fps: 12, recv_fps: 44, codec_ms: 2.5 })
  })

  it('pausada pelo servidor', () => {
    expect(watchSample(watchInput({}, 'paused'), null)!.sample.paused).toBe(true)
  })

  it('ainda sem recepção: null', () => {
    expect(watchSample({ ...watchInput({}), report: report({}) }, null)).toBeNull()
  })
})

describe('transportOf', () => {
  it('sem transporte selecionado: o par indicado e bem-sucedido', () => {
    const r = report({
      p1: { type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'l1' },
      l1: { type: 'local-candidate', protocol: 'tcp' }
    })
    expect(transportOf(r)).toBe('tcp')
  })
  it('nada: vazio', () => {
    expect(transportOf(report({}))).toBe('')
  })
})
