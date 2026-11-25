import { describe, expect, it } from 'vitest'
import { sampleEvents } from './telemetryEvents'
import { emptySample, type TelemetrySample } from './telemetryTypes'

const s = (over: Partial<TelemetrySample>): TelemetrySample => ({ ...emptySample(), ...over })
const types = (events: { type: string }[]): string[] => events.map((e) => e.type)

describe('sampleEvents: quem transmite', () => {
  it('degrau caiu e subiu, com o motivo', () => {
    const down = sampleEvents('transmite', s({ step: 0 }), s({ step: 1, limitation: 'cpu' }))
    expect(down).toEqual([{ type: 'degrau_caiu', detail: '0 → 1 (cpu)' }])
    expect(types(sampleEvents('transmite', s({ step: 2 }), s({ step: 0 })))).toEqual([
      'degrau_subiu'
    ])
  })
  it('degrau caiu: o motivo é o do controlador, não o qualityLimitationReason', () => {
    const down = sampleEvents('transmite', s({ step: 0 }), s({ step: 1, limitation: 'none' }), {
      stepReason: 'bandwidth'
    })
    expect(down).toEqual([{ type: 'degrau_caiu', detail: '0 → 1 (bandwidth)' }])
  })
  it('reserva ligada, encoder caiu para o processador e codec trocou', () => {
    const got = sampleEvents(
      'transmite',
      s({ backup: false, hardware: true, codec: 'H265' }),
      s({ backup: true, hardware: false, codec: 'H264' })
    )
    expect(types(got)).toEqual(['reserva_ligada', 'encoder_software', 'codec_trocou'])
  })
  it('primeira amostra no processador já avisa; repetida não', () => {
    expect(types(sampleEvents('transmite', null, s({ hardware: false, codec: 'VP8' })))).toEqual([
      'encoder_software'
    ])
    expect(sampleEvents('transmite', s({ hardware: false }), s({ hardware: false }))).toEqual([])
  })
})

describe('sampleEvents: quem assiste', () => {
  it('decodificando no processador, congelamento longo e pausa do servidor', () => {
    const got = sampleEvents(
      'assiste',
      s({ hardware: true }),
      s({ hardware: false, freezes: 3, freeze_ms: 2500, paused: true, codec: 'H264' })
    )
    expect(got).toEqual([
      { type: 'decoder_software', detail: 'H264' },
      { type: 'congelamento_longo', detail: '3 congelamentos, 2,5 s' },
      { type: 'pausada_pelo_servidor', detail: '' }
    ])
  })
  it('congelamento curto e pausa contínua não viram evento', () => {
    expect(
      sampleEvents('assiste', s({ paused: true }), s({ paused: true, freeze_ms: 1999 }))
    ).toEqual([])
  })
})

describe('sampleEvents: call', () => {
  it('voz não gera eventos de vídeo', () => {
    expect(sampleEvents('call', null, s({ hardware: false }))).toEqual([])
  })
})
