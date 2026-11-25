import type { ReceiveRates } from './screenReceiveRates'

// O H.265 chega e o decodificador deste aparelho não dá conta (tela preta ou
// quase): a placa anuncia o codec, o servidor manda, e quase nada sai
// decodificado (GTX 970: 13 chegam, menos de 1 decodificado por minutos). Puro.
// Critérios estritos de propósito: um falso positivo tira o H.265 deste
// aparelho por alguns dias (docs/adr/0073).

export const HEVC_GUARD = {
  /** Leituras do começo que não contam (esperando o primeiro quadro-chave). */
  warmup: 3,
  /** Leituras seguidas (2 s cada, ~10 s) com o defeito para disparar. */
  readings: 5,
  /** Quadros chegando por segundo: abaixo disso a live pode estar parada na origem. */
  minReceivedFps: 5,
  /** Decodificados / chegando: até isso é "quase nada". */
  maxDecodedRatio: 0.2,
  /** Perda de pacotes: acima disso a culpa pode ser da rede, não do decodificador. */
  maxLossRatio: 0.02
} as const

export interface HevcGuardState {
  seen: number
  streak: number
  failed: boolean
}

export const initialHevcGuard = (): HevcGuardState => ({ seen: 0, streak: 0, failed: false })

function notDecoding(rates: ReceiveRates | null): boolean {
  return (
    rates !== null &&
    rates.codec === 'h265' &&
    rates.receivedFps >= HEVC_GUARD.minReceivedFps &&
    rates.decodedFps <= rates.receivedFps * HEVC_GUARD.maxDecodedRatio &&
    rates.lossRatio < HEVC_GUARD.maxLossRatio
  )
}

/** Uma leitura (null = não mediu); `failed` não volta atrás. */
export function hevcGuardTick(state: HevcGuardState, rates: ReceiveRates | null): HevcGuardState {
  if (state.failed) return state
  const seen = state.seen + 1
  const counts = seen > HEVC_GUARD.warmup && notDecoding(rates)
  const streak = counts ? state.streak + 1 : 0
  return { seen, streak, failed: streak >= HEVC_GUARD.readings }
}
