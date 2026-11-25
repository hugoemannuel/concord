import { describe, expect, it } from 'vitest'
import {
  describeCodecChoice,
  describeNativeChoice,
  noteScreenCodecChoice,
  takeScreenCodecChoice
} from './screenCodecChoice'

describe('describeCodecChoice', () => {
  it('preferência, codec e reserva, o que a placa codifica, camada extra e marcados', () => {
    expect(
      describeCodecChoice({
        preference: 'auto',
        support: { av1: null, h265: 'software', h264: 'hardware', vp8: 'software' },
        simulcast: true,
        codec: { videoCodec: 'h264', backupCodec: { codec: 'vp8' } },
        marked: ['h265']
      })
    ).toBe('auto: h264 + vp8 | av1 —, h265 proc., h264 placa | 720p extra | caiu no proc.: h265')
  })

  it('sem reserva, sem camada extra e nada marcado', () => {
    expect(
      describeCodecChoice({
        preference: 'vp8',
        support: { av1: 'hardware', h265: 'hardware', h264: 'hardware', vp8: 'software' },
        simulcast: false,
        codec: { videoCodec: 'vp8', backupCodec: false },
        marked: []
      })
    ).toBe('vp8: vp8 | av1 placa, h265 placa, h264 placa')
  })
})

describe('describeCodecChoice: AV1 sem as camadas temporais (ADR 0074)', () => {
  const base = {
    preference: 'auto' as const,
    support: {
      av1: 'software' as const,
      h265: 'hardware' as const,
      h264: 'hardware' as const,
      vp8: 'software' as const
    },
    simulcast: false,
    codec: { videoCodec: 'h265' as const, backupCodec: { codec: 'h264' as const } },
    marked: []
  }
  it('o L1T1 na placa e o L1T3 não: anota ao lado', () => {
    expect(describeCodecChoice({ ...base, av1Plain: 'hardware' })).toBe(
      'auto: h265 + h264 | av1 proc. (L1T1 placa), h265 placa, h264 placa'
    )
  })
  it('mesma resposta: não repete', () => {
    expect(describeCodecChoice({ ...base, av1Plain: 'software' })).toBe(
      'auto: h265 + h264 | av1 proc., h265 placa, h264 placa'
    )
  })
})

describe('describeNativeChoice', () => {
  it('a live pelo motor nativo: o motor e onde o H.264 saiu', () => {
    expect(describeNativeChoice(true)).toBe('nativo: h264 placa')
    expect(describeNativeChoice(false)).toBe('nativo: h264 proc.')
    expect(describeNativeChoice(null)).toBe('nativo: h264 —')
  })
})

describe('describeCodecChoice com o som da tela', () => {
  it('anota de onde veio o som da live', () => {
    expect(
      describeCodecChoice({
        preference: 'auto',
        support: { av1: null, h265: 'hardware', h264: 'software', vp8: 'software' },
        simulcast: false,
        codec: { videoCodec: 'h265', backupCodec: false },
        marked: [],
        sound: 'sistema'
      })
    ).toBe('auto: h265 | av1 —, h265 placa, h264 proc. | som: sistema')
  })
})

describe('noteScreenCodecChoice', () => {
  it('a telemetria leva a última escolha uma vez', () => {
    noteScreenCodecChoice('a')
    noteScreenCodecChoice('b')
    expect(takeScreenCodecChoice()).toBe('b')
    expect(takeScreenCodecChoice()).toBeNull()
  })
})
