import { afterEach, describe, expect, it } from 'vitest'
import { describeDsp, forgetMicDsp, readMicDsp, watchMicDsp } from './micDspStats'

const on = { rnnoise: true, preset: 'robo', gate: true }

afterEach(() => {
  forgetMicDsp({} as AudioContext)
})

describe('describeDsp', () => {
  it('o que está ligado no microfone', () => {
    expect(describeDsp(on)).toBe('rnnoise · voz:robo · portão')
    expect(describeDsp({ rnnoise: false, preset: 'normal', gate: false })).toBe('nenhum')
  })
})

describe('readMicDsp', () => {
  it('soma o atraso e o tempo tocado dos microfones abertos (playbackStats)', () => {
    const a = {
      playbackStats: { underrunDuration: 0.5, totalDuration: 100 }
    } as unknown as AudioContext
    const b = {
      playoutStats: { fallbackFramesDuration: 1, totalFramesDuration: 50 }
    } as unknown as AudioContext
    watchMicDsp(a)
    watchMicDsp(b)
    expect(readMicDsp(on)).toEqual({
      underrun: 1.5,
      total: 150,
      dsp: 'rnnoise · voz:robo · portão'
    })
    forgetMicDsp(a)
    forgetMicDsp(b)
    expect(readMicDsp(on)).toBeNull()
  })
  it('navegador sem as estatísticas: só o que está ligado', () => {
    const ctx = {} as AudioContext
    watchMicDsp(ctx)
    expect(readMicDsp(on)).toEqual({
      underrun: null,
      total: null,
      dsp: 'rnnoise · voz:robo · portão'
    })
    forgetMicDsp(ctx)
  })
})
