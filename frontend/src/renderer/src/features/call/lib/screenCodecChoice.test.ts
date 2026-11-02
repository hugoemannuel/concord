import { describe, expect, it } from 'vitest'
import {
  describeCodecChoice,
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
