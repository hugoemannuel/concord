import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hevcFailureDetail, reportHevcDecodeFailure, takeHevcDecodeFailure } from './screenHevcFailure'
import type { ReceiveRates } from './screenReceiveRates'

const rates: ReceiveRates = { codec: 'h265', receivedFps: 12.9, decodedFps: 0.4, decodeMs: 3, lossRatio: 0 }
const GTX = 'ANGLE (NVIDIA, NVIDIA GeForce GTX 970 Direct3D11 vs_5_0 ps_5_0, D3D11)'

beforeEach(() => {
  takeHevcDecodeFailure('bia')
})
afterEach(() => vi.useRealTimers())

describe('reportHevcDecodeFailure', () => {
  it('grava a marca no processo principal e deixa o evento para a telemetria da live (uma vez)', () => {
    const api = { hevcDecodeFailed: vi.fn() }
    expect(reportHevcDecodeFailure('bia', rates, GTX, api)).toBe(true)
    expect(api.hevcDecodeFailed).toHaveBeenCalledTimes(1)
    expect(takeHevcDecodeFailure('bia')).toBe(hevcFailureDetail(rates))
    expect(takeHevcDecodeFailure('bia')).toBeNull()
    expect(takeHevcDecodeFailure('caio')).toBeNull()
  })

  it('com o driver de vídeo fora do ar (Basic Render Driver) não marca nem avisa', () => {
    const api = { hevcDecodeFailed: vi.fn() }
    const basic = 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)'
    expect(reportHevcDecodeFailure('bia', rates, basic, api)).toBe(false)
    expect(api.hevcDecodeFailed).not.toHaveBeenCalled()
    expect(takeHevcDecodeFailure('bia')).toBeNull()
  })

  it('no navegador (sem o app): só o evento, dizendo que não há marca', () => {
    expect(reportHevcDecodeFailure('bia', rates, GTX, undefined)).toBe(true)
    expect(takeHevcDecodeFailure('bia')).toBe(`${hevcFailureDetail(rates)} (navegador, sem marca)`)
  })

  it('regressão: evento que ninguém levou não vai parar numa live de outra chamada', () => {
    vi.useFakeTimers()
    reportHevcDecodeFailure('bia', rates, GTX, { hevcDecodeFailed: vi.fn() })
    vi.advanceTimersByTime(5 * 60_000)
    expect(takeHevcDecodeFailure('bia')).toBeNull()
  })
})

describe('hevcFailureDetail', () => {
  it('só números técnicos', () => {
    expect(hevcFailureDetail(rates)).toBe('h265: 12,9 chegam, 0,4 decodificados por segundo')
  })
})
