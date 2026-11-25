import { describe, expect, it } from 'vitest'
import { callMediaCounters, callMediaSignals } from './telemetryCallMedia'

const report = (stats: Record<string, Record<string, unknown>>): RTCStatsReport =>
  new Map(Object.entries(stats).map(([id, s]) => [id, { id, ...s }])) as unknown as RTCStatsReport

const dsp = (underrun: number | null, total: number | null) => ({
  underrun,
  total,
  dsp: 'rnnoise · portão'
})

function camera(t: number, frames: number, freezes: Record<string, number>): RTCStatsReport {
  return report({
    low: {
      type: 'outbound-rtp',
      kind: 'video',
      frameHeight: 180,
      framesEncoded: 9999,
      timestamp: t
    },
    high: {
      type: 'outbound-rtp',
      kind: 'video',
      frameHeight: 720,
      framesEncoded: frames,
      framesPerSecond: 29,
      qualityLimitationReason: 'cpu',
      timestamp: t
    },
    off: { type: 'outbound-rtp', kind: 'video', frameHeight: 1080, active: false },
    voice: { type: 'outbound-rtp', kind: 'audio' },
    ...Object.fromEntries(
      Object.entries(freezes).map(([id, n]) => [
        id,
        { type: 'inbound-rtp', kind: 'video', freezeCount: n }
      ])
    )
  })
}

describe('callMediaSignals', () => {
  it('primeira leitura: o fps do momento da câmera, sem as diferenças', () => {
    const r = camera(20_000, 600, { bia: 2 })
    const now = callMediaCounters(r, dsp(1, 100))
    expect(callMediaSignals(r, now, null, dsp(1, 100))).toMatchObject({
      cam_fps: 29,
      cam_height: 720,
      cam_limitation: 'cpu',
      cam_freezes: null,
      dsp_underrun_pct: null,
      dsp: 'rnnoise · portão',
      playout_synth_pct: null
    })
  })

  it('no intervalo: fps da camada de cima, congelamentos das câmeras que seguem e o microfone', () => {
    const r1 = camera(20_000, 600, { bia: 2, caio: 0 })
    const r2 = camera(80_000, 2040, { bia: 5, duda: 9 })
    const prev = callMediaCounters(r1, dsp(1, 100))
    const now = callMediaCounters(r2, dsp(1.6, 160))
    expect(callMediaSignals(r2, now, prev, dsp(1.6, 160))).toMatchObject({
      cam_fps: 24,
      cam_freezes: 3,
      dsp_underrun_pct: 1
    })
  })

  it('saída de áudio: % sintetizado no intervalo (media-playout)', () => {
    const at = (synth: number, total: number) =>
      report({
        mp: {
          type: 'media-playout',
          kind: 'audio',
          synthesizedSamplesDuration: synth,
          totalSamplesDuration: total
        }
      })
    const prev = callMediaCounters(at(0.5, 100), null)
    const r = at(1.1, 160)
    const now = callMediaCounters(r, null)
    expect(callMediaSignals(r, now, prev, null)).toMatchObject({
      playout_synth_pct: 1,
      dsp: null,
      dsp_underrun_pct: null,
      cam_fps: null,
      cam_height: null
    })
  })

  it('sem as estatísticas do microfone: só o que estava ligado', () => {
    const r = report({})
    const prev = callMediaCounters(r, dsp(null, null))
    const now = callMediaCounters(r, dsp(null, null))
    expect(callMediaSignals(r, now, prev, dsp(null, null))).toMatchObject({
      dsp_underrun_pct: null,
      dsp: 'rnnoise · portão'
    })
  })
})
