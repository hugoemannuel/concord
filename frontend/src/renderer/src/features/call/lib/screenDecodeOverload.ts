import type { ReceiveRates } from './screenReceiveRates'

// O decodificador não dá conta da camada de cima da live (Intel UHD 730: 52
// quadros chegando, 18 decodificados, 44 ms por quadro): pedir a camada menor
// e voltar depois de alguns minutos sem gargalo. Com histerese: cada vez que
// volta e engasga de novo, a espera dobra. Puro (docs/adr/0073).

export const DECODE_OVERLOAD = {
  /** Leituras seguidas (2 s cada) com gargalo para descer. */
  downAfter: 3,
  /** Abaixo disso chegando, não dá para culpar o decodificador. */
  minReceivedFps: 10,
  /** Decodificados abaixo desta fração dos que chegam. */
  decodedRatio: 0.8,
  /** E o tempo por quadro acima desta fração do intervalo entre quadros. */
  frameBudget: 0.6,
  /** Sem gargalo por isso na camada de baixo: volta para a de cima. */
  holdMs: 3 * 60_000,
  maxHoldMs: 24 * 60_000
} as const

export interface DecodeOverloadState {
  low: boolean
  /** Leituras seguidas com gargalo (na camada de cima). */
  bad: number
  /** Quantas vezes desceu nesta live (a espera dobra a cada uma). */
  downs: number
  holdMs: number
  /** Desde quando está sem gargalo na camada de baixo (ms). */
  calmSince: number | null
}

export const initialDecodeOverload = (): DecodeOverloadState => ({
  low: false,
  bad: 0,
  downs: 0,
  holdMs: DECODE_OVERLOAD.holdMs,
  calmSince: null
})

function overloaded(rates: ReceiveRates): boolean {
  const { receivedFps, decodedFps, decodeMs } = rates
  return (
    receivedFps >= DECODE_OVERLOAD.minReceivedFps &&
    decodedFps < receivedFps * DECODE_OVERLOAD.decodedRatio &&
    decodeMs !== null &&
    decodeMs > (DECODE_OVERLOAD.frameBudget * 1000) / receivedFps
  )
}

function whileHigh(state: DecodeOverloadState, rates: ReceiveRates): DecodeOverloadState {
  const bad = overloaded(rates) ? state.bad + 1 : 0
  if (bad < DECODE_OVERLOAD.downAfter) return { ...state, bad }
  const holdMs = Math.min(DECODE_OVERLOAD.holdMs * 2 ** state.downs, DECODE_OVERLOAD.maxHoldMs)
  return { low: true, bad: 0, downs: state.downs + 1, holdMs, calmSince: null }
}

function whileLow(state: DecodeOverloadState, rates: ReceiveRates, now: number): DecodeOverloadState {
  if (overloaded(rates)) return { ...state, calmSince: null }
  const calmSince = state.calmSince ?? now
  if (now - calmSince < state.holdMs) return { ...state, calmSince }
  return { ...state, low: false, bad: 0, calmSince: null }
}

/** Uma leitura (null = não mediu: nada muda). */
export function decodeOverloadTick(
  state: DecodeOverloadState,
  rates: ReceiveRates | null,
  now: number
): DecodeOverloadState {
  if (!rates) return state
  return state.low ? whileLow(state, rates, now) : whileHigh(state, rates)
}
