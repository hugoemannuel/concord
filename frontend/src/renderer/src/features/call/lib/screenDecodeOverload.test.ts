import { describe, expect, it } from 'vitest'
import {
  DECODE_OVERLOAD,
  decodeOverloadTick,
  initialDecodeOverload,
  type DecodeOverloadState
} from './screenDecodeOverload'
import type { ReceiveRates } from './screenReceiveRates'

// Intel UHD 730: 52 chegam, 18 decodificados, 44 ms por quadro.
const choking: ReceiveRates = { codec: 'h264', receivedFps: 52, decodedFps: 18, decodeMs: 44, lossRatio: 0 }
const fine: ReceiveRates = { ...choking, decodedFps: 52, decodeMs: 4 }

const MIN = 60_000

function run(state: DecodeOverloadState, readings: ReceiveRates[], start: number, stepMs = 2000) {
  readings.forEach((r, i) => (state = decodeOverloadTick(state, r, start + i * stepMs)))
  return state
}

const times = (n: number, r: ReceiveRates) => Array.from({ length: n }, () => r)

describe('decodeOverloadTick', () => {
  it('regressão (UHD 730): decodificador não dá conta em leituras seguidas → pede a camada baixa', () => {
    const state = run(initialDecodeOverload(), times(DECODE_OVERLOAD.downAfter, choking), 0)
    expect(state.low).toBe(true)
  })

  it('uma leitura ruim só não desce', () => {
    const state = run(initialDecodeOverload(), [choking, fine, choking, fine], 0)
    expect(state.low).toBe(false)
  })

  it('quadros soltos sem tempo por quadro alto (ou poucos quadros) não é o decodificador', () => {
    const cases: ReceiveRates[] = [
      { ...choking, decodeMs: 5 },
      { ...choking, decodeMs: null },
      { ...choking, receivedFps: 6, decodedFps: 2 }
    ]
    for (const reading of cases) {
      expect(run(initialDecodeOverload(), times(10, reading), 0).low).toBe(false)
    }
  })

  it('volta para a de cima depois de alguns minutos sem gargalo, não antes', () => {
    const low = run(initialDecodeOverload(), times(DECODE_OVERLOAD.downAfter, choking), 0)
    const t = DECODE_OVERLOAD.downAfter * 2000
    const almost = decodeOverloadTick(low, fine, t + DECODE_OVERLOAD.holdMs - 1000)
    expect(almost.low).toBe(true)
    const steady = run(low, times(Math.ceil(DECODE_OVERLOAD.holdMs / 2000) + 1, fine), t)
    expect(steady.low).toBe(false)
  })

  it('gargalo durante a espera recomeça o relógio', () => {
    let state = run(initialDecodeOverload(), times(DECODE_OVERLOAD.downAfter, choking), 0)
    state = decodeOverloadTick(state, fine, 1 * MIN)
    state = decodeOverloadTick(state, choking, 2 * MIN)
    state = decodeOverloadTick(state, fine, 2 * MIN + DECODE_OVERLOAD.holdMs - 1000)
    expect(state.low).toBe(true)
  })

  it('histerese: voltou e engasgou de novo → a próxima espera é o dobro (com teto)', () => {
    let state = run(initialDecodeOverload(), times(DECODE_OVERLOAD.downAfter, choking), 0)
    expect(state.holdMs).toBe(DECODE_OVERLOAD.holdMs)
    state = decodeOverloadTick(state, fine, 10_000)
    state = decodeOverloadTick(state, fine, 10_000 + DECODE_OVERLOAD.holdMs)
    expect(state.low).toBe(false)
    state = run(state, times(DECODE_OVERLOAD.downAfter, choking), 20 * MIN)
    expect(state).toMatchObject({ low: true, holdMs: DECODE_OVERLOAD.holdMs * 2 })
    for (let i = 0; i < 10; i++) {
      state = { ...state, low: false }
      state = run(state, times(DECODE_OVERLOAD.downAfter, choking), (30 + i) * MIN)
    }
    expect(state.holdMs).toBe(DECODE_OVERLOAD.maxHoldMs)
  })

  it('sem medida (null) não mexe', () => {
    const low = run(initialDecodeOverload(), times(DECODE_OVERLOAD.downAfter, choking), 0)
    expect(decodeOverloadTick(low, null, 99 * MIN)).toEqual(low)
  })
})
