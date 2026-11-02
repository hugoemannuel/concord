import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  codecChoices,
  loadScreenCodec,
  saveScreenCodec,
  screenCodecOptions,
  SCREEN_CODEC_KEY,
  H265_LAYER_KEY
} from './screenCodec'
import type { ScreenCodecSupport } from './screenCodecSupport'

afterEach(() => vi.unstubAllGlobals())

const support = (partial: Partial<ScreenCodecSupport>): ScreenCodecSupport => ({
  av1: null,
  h265: null,
  h264: null,
  vp8: 'software',
  ...partial
})
const all = support({ av1: 'hardware', h265: 'hardware', h264: 'hardware' })
const h265Card = support({ av1: 'software', h265: 'hardware', h264: 'hardware' })
const h264Card = support({ av1: 'software', h265: null, h264: 'hardware' })
const cpuOnly = support({ av1: 'software', h264: 'software' })
const vp8Only = support({})

describe('screenCodecOptions: automático = melhor da placa de vídeo', () => {
  it('AV1 na placa: AV1, com H.264 de reserva para quem não decodifica', () => {
    expect(screenCodecOptions('auto', all)).toEqual({
      videoCodec: 'av1',
      backupCodec: { codec: 'h264' }
    })
  })

  it('sem AV1 na placa, com H.265: H.265, com H.264 de reserva', () => {
    expect(screenCodecOptions('auto', h265Card)).toEqual({
      videoCodec: 'h265',
      backupCodec: { codec: 'h264' }
    })
  })

  it('só H.264 na placa: H.264 com VP8 de reserva', () => {
    expect(screenCodecOptions('auto', h264Card)).toEqual({
      videoCodec: 'h264',
      backupCodec: { codec: 'vp8' }
    })
  })

  it('nada na placa: H.264 pelo processador; AV1/H.265 por software nunca', () => {
    expect(screenCodecOptions('auto', cpuOnly)).toEqual({
      videoCodec: 'h264',
      backupCodec: { codec: 'vp8' }
    })
    expect(
      screenCodecOptions('auto', support({ h265: 'software', h264: 'software' })).videoCodec
    ).toBe('h264')
  })

  it('sem H.264 no navegador: VP8 sem reserva', () => {
    expect(screenCodecOptions('auto', vp8Only)).toEqual({ videoCodec: 'vp8', backupCodec: false })
  })

  it('AV1/H.265 na placa sem H.264: reserva VP8', () => {
    expect(screenCodecOptions('auto', support({ h265: 'hardware' }))).toEqual({
      videoCodec: 'h265',
      backupCodec: { codec: 'vp8' }
    })
  })

  it('regressão: com a camada extra de 720p pula AV1 e H.265 (no H.265 caía para VP8)', () => {
    expect(screenCodecOptions('auto', all, true).videoCodec).toBe('h264')
    expect(screenCodecOptions('h265', h265Card, true).videoCodec).toBe('h264')
    expect(
      screenCodecOptions('auto', support({ av1: 'hardware', h264: 'hardware' }), true).videoCodec
    ).toBe('h264')
  })
})

describe('screenCodecOptions: codecs que falharam nesta live', () => {
  it('H.265 trocou sozinho: republica em H.264; H.264 falhou: VP8', () => {
    expect(screenCodecOptions('auto', h265Card, false, ['h265'])).toEqual({
      videoCodec: 'h264',
      backupCodec: { codec: 'vp8' }
    })
    expect(screenCodecOptions('h264', h264Card, false, ['h264'])).toEqual({
      videoCodec: 'vp8',
      backupCodec: false
    })
  })

  it('flag de teste: H.265 com a camada extra', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === H265_LAYER_KEY ? '1' : null) })
    expect(screenCodecOptions('auto', h265Card, true).videoCodec).toBe('h265')
  })
})

describe('screenCodecOptions: escolhido em Avançado', () => {
  it('fixa o codec escolhido quando a placa codifica', () => {
    expect(screenCodecOptions('h265', all).videoCodec).toBe('h265')
    expect(screenCodecOptions('h264', all)).toEqual({
      videoCodec: 'h264',
      backupCodec: { codec: 'vp8' }
    })
    expect(screenCodecOptions('vp8', all)).toEqual({ videoCodec: 'vp8', backupCodec: false })
  })

  it('indisponível: desce para o próximo da ordem, nunca sobe', () => {
    expect(screenCodecOptions('av1', h265Card).videoCodec).toBe('h265')
    expect(screenCodecOptions('h265', h264Card).videoCodec).toBe('h264')
    expect(screenCodecOptions('h264', vp8Only).videoCodec).toBe('vp8')
  })
})

describe('codecChoices', () => {
  it('AV1 e H.265 só na placa; H.264 também pelo processador; VP8 sempre', () => {
    expect(codecChoices(cpuOnly)).toEqual({
      av1: false,
      h265: false,
      h264: true,
      vp8: true
    })
    expect(codecChoices(all)).toEqual({ av1: true, h265: true, h264: true, vp8: true })
  })
})

describe('preferência de codec', () => {
  it('padrão automático; salva e lê de volta; valor estranho volta ao automático', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v)
    })
    expect(loadScreenCodec()).toBe('auto')
    saveScreenCodec('vp8')
    expect(data.get(SCREEN_CODEC_KEY)).toBe('vp8')
    expect(loadScreenCodec()).toBe('vp8')
    for (const codec of ['h264', 'h265', 'av1'] as const) {
      saveScreenCodec(codec)
      expect(loadScreenCodec()).toBe(codec)
    }
    data.set(SCREEN_CODEC_KEY, 'vp9')
    expect(loadScreenCodec()).toBe('auto')
  })

  it('sem armazenamento local: automático, sem quebrar', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      }
    })
    expect(loadScreenCodec()).toBe('auto')
    expect(() => saveScreenCodec('vp8')).not.toThrow()
  })
})
