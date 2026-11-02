import { describe, expect, it } from 'vitest'
import { evenScale } from './screenScale'

/** Como o libwebrtc calcula o tamanho da camada: trunca largura/escala. */
const layer = (width: number, height: number, scale: number): [number, number] => [
  Math.trunc(width / scale),
  Math.trunc(height / scale)
]

describe('evenScale', () => {
  it('16:9 exato: a escala de sempre (1440p → 720p = 2, 1080p → 720p = 1,5)', () => {
    expect(evenScale(2560, 1440, 720)).toBe(2)
    expect(evenScale(1920, 1080, 720)).toBe(1.5)
  })

  it('regressão: janela de 2560×1438 não vira camada de 1281×720 (a placa recusa lado ímpar)', () => {
    // Antes: 1438/720 → 1281×720, e o H.265 da placa caía para VP8 (tela preta).
    const [width, height] = layer(2560, 1438, evenScale(2560, 1438, 720))
    expect(width % 2).toBe(0)
    expect(height % 2).toBe(0)
    expect(height).toBeLessThanOrEqual(720)
    expect(height).toBeGreaterThan(700)
  })

  it('tamanhos de janela vistos na telemetria saem sempre pares', () => {
    for (const [w, h] of [
      [1918, 802],
      [1538, 864],
      [1920, 1078],
      [1718, 718],
      [2560, 1080],
      [1440, 2560]
    ]) {
      const [width, height] = layer(w, h, evenScale(w, h, 720))
      expect([width % 2, height % 2]).toEqual([0, 0])
    }
  })

  it('fonte no alvo ou menor: não amplia (1); sem tamanho: 1', () => {
    expect(evenScale(1280, 720, 720)).toBe(1)
    expect(evenScale(960, 540, 720)).toBe(1)
    expect(evenScale(0, 0, 720)).toBe(1)
  })
})
