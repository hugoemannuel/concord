import { sampleEvents } from './telemetryEvents'
import { emptySample, type TelemetrySample } from './telemetryTypes'

const s = (over: Partial<TelemetrySample>): TelemetrySample => ({ ...emptySample(), ...over })
const types = (events: { type: string }[]): string[] => events.map((e) => e.type)

describe('sampleEvents', () => {
  it('transmite: codificador caiu para o processador e codec trocou', () => {
    const got = sampleEvents('transmite', s({ hardware: true, codec: 'H264' }), s({ hardware: false, codec: 'VP8' }))
    expect(types(got)).toEqual(['encoder_software', 'codec_trocou'])
    expect(sampleEvents('transmite', s({ hardware: false }), s({ hardware: false }))).toEqual([])
  })

  it('assiste: decodificando no processador, congelamento longo e pausa do servidor', () => {
    const got = sampleEvents('assiste', s({ hardware: true }), s({ hardware: false, freezes: 3, freeze_ms: 2500, paused: true, codec: 'H264' }))
    expect(got).toEqual([
      { type: 'decoder_software', detail: 'H264' },
      { type: 'congelamento_longo', detail: '3 congelamentos, 2,5 s' },
      { type: 'pausada_pelo_servidor', detail: '' }
    ])
    expect(sampleEvents('assiste', s({ paused: true }), s({ paused: true, freeze_ms: 1999 }))).toEqual([])
  })

  it('o software leva o nome do componente quando o WebRTC diz; sem nome, só o codec', () => {
    const now = s({ hardware: false, codec: 'H265' })
    expect(sampleEvents('assiste', null, now, 'c2.android.hevc.decoder')).toEqual([{ type: 'decoder_software', detail: 'H265 · c2.android.hevc.decoder' }])
    expect(sampleEvents('transmite', null, now, 'libvpx')).toEqual([{ type: 'encoder_software', detail: 'H265 · libvpx' }])
    expect(sampleEvents('transmite', null, now, '')).toEqual([{ type: 'encoder_software', detail: 'H265' }])
  })

  it('call: a voz não gera eventos de vídeo', () => {
    expect(sampleEvents('call', null, s({ hardware: false }))).toEqual([])
  })
})
