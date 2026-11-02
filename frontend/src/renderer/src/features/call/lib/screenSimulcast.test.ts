import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SIMULCAST_KEY,
  loadScreenSimulcast,
  saveScreenSimulcast,
  chooseScreenSimulcast,
  screenSenderEncodings,
  simulcastLayers,
  usesSimulcast
} from './screenSimulcast'
import { H265_LAYER_KEY } from './screenCodec'
import type { ScreenCodecSupport } from './screenCodecSupport'
import type { ScreenShareQuality } from './screenShareQuality'

afterEach(() => vi.unstubAllGlobals())

const fullHd = { width: 1920, height: 1080 }

describe('usesSimulcast', () => {
  it('só com a opção marcada e captura acima de 720p', () => {
    expect(usesSimulcast(true, { resolution: '1080p', frameRate: 60 }, fullHd)).toBe(true)
    expect(usesSimulcast(false, { resolution: '1080p', frameRate: 60 }, fullHd)).toBe(false)
    expect(usesSimulcast(true, { resolution: '720p', frameRate: 60 }, fullHd)).toBe(false)
    expect(usesSimulcast(true, { resolution: 'source', frameRate: 30 }, { width: 1280, height: 720 })).toBe(false)
  })
})

describe('screenSenderEncodings', () => {
  it('uma camada: só o envio do degrau', () => {
    expect(screenSenderEncodings({ resolution: '1080p', frameRate: 60 }, fullHd, 1)).toEqual([
      { maxBitrate: 7_000_000, maxFramerate: 60 }
    ])
  })

  it('duas camadas: 720p30 (3 Mbps) por baixo do envio principal', () => {
    expect(screenSenderEncodings({ resolution: '1080p', frameRate: 60 }, fullHd, 2)).toEqual([
      { maxBitrate: 3_000_000, maxFramerate: 30, scaleResolutionDownBy: 1.5 },
      { maxBitrate: 7_000_000, maxFramerate: 60 }
    ])
  })
})

describe('lados pares na camada de 720p (o codificador da placa no Windows recusa ímpar)', () => {
  const truncated = (width: number, height: number, scale: number): number[] => [
    Math.trunc(width / scale) % 2,
    Math.trunc(height / scale) % 2
  ]

  it('regressão: janela de 2560×1438 publica a camada com lados pares (antes 1281×720)', () => {
    const [preset] = simulcastLayers({ width: 2560, height: 1438 })
    // O LiveKit faz escala = lado menor / lado menor do preset.
    const scale = 1438 / Math.min(preset.width, preset.height)
    expect(truncated(2560, 1438, scale)).toEqual([0, 0])
  })

  it('16:9 e sem tamanho: o 1280×720 de sempre', () => {
    expect(simulcastLayers(fullHd)[0]).toMatchObject({ width: 1280, height: 720 })
    expect(simulcastLayers({})[0]).toMatchObject({ width: 1280, height: 720 })
  })

  it('troca de degrau ao vivo também mantém os lados pares', () => {
    const [low] = screenSenderEncodings(
      { resolution: 'source', frameRate: 60 },
      { width: 2560, height: 1438 },
      2
    )
    expect(truncated(2560, 1438, low.scaleResolutionDownBy ?? 1)).toEqual([0, 0])
  })
})

describe('preferência da camada extra', () => {
  it('Automático por padrão; salva os três modos e lê de volta; sem armazenamento não quebra', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v)
    })
    expect(loadScreenSimulcast()).toBe('auto')
    saveScreenSimulcast('on')
    expect(data.get(SIMULCAST_KEY)).toBe('1')
    expect(loadScreenSimulcast()).toBe('on')
    saveScreenSimulcast('off')
    expect(data.get(SIMULCAST_KEY)).toBe('0')
    expect(loadScreenSimulcast()).toBe('off')
    saveScreenSimulcast('auto')
    expect(loadScreenSimulcast()).toBe('auto')
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('x')
      },
      setItem: () => {
        throw new Error('x')
      }
    })
    expect(loadScreenSimulcast()).toBe('auto')
    expect(() => saveScreenSimulcast('on')).not.toThrow()
  })
})

describe('chooseScreenSimulcast', () => {
  const full = { resolution: '1080p', frameRate: 60 } as const
  const card = (over: Partial<ScreenCodecSupport> = {}): ScreenCodecSupport => ({
    av1: null,
    h265: null,
    h264: 'hardware',
    vp8: 'software',
    ...over
  })
  const choose = (
    mode: 'auto' | 'on' | 'off',
    support: ScreenCodecSupport,
    quality: ScreenShareQuality = full,
    source = fullHd
  ): boolean => chooseScreenSimulcast(mode, quality, source, support, 'auto')

  it('Automático: codec na placa de vídeo e live em 1080p → liga', () => {
    expect(choose('auto', card())).toBe(true)
    expect(choose('auto', card(), { resolution: 'source', frameRate: 30 })).toBe(true)
  })

  it('Automático: codec pelo processador → desliga', () => {
    expect(choose('auto', card({ h264: 'software' }))).toBe(false)
    expect(choose('auto', card({ h264: null }))).toBe(false)
  })

  it('Automático: 720p não tem camada extra, mesmo na placa de vídeo', () => {
    expect(choose('auto', card(), { resolution: '720p', frameRate: 60 })).toBe(false)
  })

  it('Automático: AV1 na placa fica sem a camada extra (o SDK só publica AV1 numa camada)', () => {
    expect(choose('auto', card({ av1: 'hardware' }))).toBe(false)
  })

  it('regressão: H.265 na placa fica numa camada só (com a de 720p caía para VP8 = tela preta)', () => {
    expect(choose('auto', card({ h265: 'hardware' }))).toBe(false)
  })

  it('flag de teste: H.265 com a camada extra volta a ligar', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === H265_LAYER_KEY ? '1' : null) })
    expect(choose('auto', card({ h265: 'hardware' }))).toBe(true)
  })

  it('Automático: marca de software (a live caiu no processador) desliga na próxima', () => {
    expect(choose('auto', card({ h265: 'software', h264: 'software' }))).toBe(false)
  })

  it('escolha manual é respeitada, qualquer que seja o codec', () => {
    expect(choose('on', card({ h264: 'software' }))).toBe(true)
    expect(choose('on', card({ av1: 'hardware' }))).toBe(true)
    expect(choose('off', card())).toBe(false)
    expect(choose('on', card(), { resolution: '720p', frameRate: 60 })).toBe(false)
  })

  it('o codec escolhido em Avançado é o que conta no Automático', () => {
    const support = card({ h265: 'hardware', h264: 'software' })
    expect(chooseScreenSimulcast('auto', full, fullHd, support, 'h264')).toBe(false)
    expect(chooseScreenSimulcast('auto', full, fullHd, card({ h265: 'hardware' }), 'h264')).toBe(
      true
    )
  })
})
