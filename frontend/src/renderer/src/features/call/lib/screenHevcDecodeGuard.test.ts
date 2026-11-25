import { describe, expect, it } from 'vitest'
import { HEVC_GUARD, hevcGuardTick, initialHevcGuard, type HevcGuardState } from './screenHevcDecodeGuard'
import type { ReceiveRates } from './screenReceiveRates'

const black: ReceiveRates = { codec: 'h265', receivedFps: 13, decodedFps: 0.5, decodeMs: 3, lossRatio: 0 }
const fine: ReceiveRates = { ...black, decodedFps: 13 }

function run(readings: (ReceiveRates | null)[], state: HevcGuardState = initialHevcGuard()) {
  for (const r of readings) state = hevcGuardTick(state, r)
  return state
}

const times = (n: number, r: ReceiveRates | null) => Array.from({ length: n }, () => r)

describe('hevcGuardTick', () => {
  it('regressão (GTX 970): H.265 chegando e quase nada decodificado por ~10 s → falhou', () => {
    const state = run(times(HEVC_GUARD.warmup + HEVC_GUARD.readings, black))
    expect(state.failed).toBe(true)
  })

  it('o começo (esperando o quadro-chave) não conta', () => {
    expect(run(times(HEVC_GUARD.warmup + HEVC_GUARD.readings - 1, black)).failed).toBe(false)
  })

  it('uma leitura boa no meio recomeça a contagem', () => {
    const half = times(HEVC_GUARD.readings - 1, black)
    const state = run([...times(HEVC_GUARD.warmup, fine), ...half, fine, ...half])
    expect(state.failed).toBe(false)
  })

  it('não dispara com H.264, com poucos quadros chegando, com perda na rede nem decodificando bem', () => {
    const cases: ReceiveRates[] = [
      { ...black, codec: 'h264' },
      { ...black, receivedFps: 4 },
      { ...black, lossRatio: 0.05 },
      { ...black, decodedFps: 4 },
      fine
    ]
    for (const reading of cases) {
      expect(run(times(HEVC_GUARD.warmup + HEVC_GUARD.readings * 3, reading)).failed).toBe(false)
    }
  })

  it('leitura que não mede (null) recomeça a contagem', () => {
    const half = times(HEVC_GUARD.readings - 1, black)
    expect(run([...times(HEVC_GUARD.warmup, fine), ...half, null, ...half]).failed).toBe(false)
  })

  it('depois de falhar fica falhado (o aviso sai uma vez só)', () => {
    const failed = run(times(HEVC_GUARD.warmup + HEVC_GUARD.readings, black))
    expect(hevcGuardTick(failed, fine).failed).toBe(true)
  })
})
