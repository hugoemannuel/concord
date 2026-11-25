import { describe, expect, it } from 'vitest'
import { mediaLine } from './mediaFormat'

describe('mediaLine (ADR 0074)', () => {
  it('quem transmite: a fonte, o motor, o QP e o tempo até o ar', () => {
    expect(
      mediaLine({
        kind: 'transmite',
        surface: 'monitor',
        source_height: 1440,
        engine: 'nativo',
        qp: 31.4,
        start_ms: 2400
      })
    ).toBe('Monitor de 1440p · motor nativo · QP 31 · no ar em 2,4 s')
  })
  it('quem assiste: o primeiro quadro e a tela parada descontada', () => {
    expect(mediaLine({ kind: 'assiste', start_ms: 900, static_freezes: 12 })).toBe(
      '1º quadro em 0,9 s · 12 congel. de tela parada descontados'
    )
  })
  it('a voz: microfone, saída de áudio e câmera', () => {
    expect(
      mediaLine({
        kind: 'call',
        dsp_underrun_pct: 1.5,
        dsp: 'rnnoise · portão',
        playout_synth_pct: 0.3,
        cam_fps: 24,
        cam_freezes: 6,
        cam_seconds: 180
      })
    ).toBe(
      'Microfone atrasou 1,5% (rnnoise · portão) · saída de áudio sintetizou 0,3% · câmera 24 fps · câmeras recebidas 2 congel./min'
    )
  })
  it('sem os sinais (backend ou app de antes): null', () => {
    expect(mediaLine({ kind: 'transmite' })).toBeNull()
    expect(
      mediaLine({ kind: 'call', static_freezes: 0, cam_freezes: 0, cam_seconds: 0 })
    ).toBeNull()
  })
  it('janela sem altura e motor do Chromium', () => {
    expect(mediaLine({ kind: 'transmite', surface: 'window', engine: 'chromium' })).toBe(
      'Janela · Chromium'
    )
  })
})
