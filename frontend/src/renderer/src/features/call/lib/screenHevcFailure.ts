import type { ReceiveRates } from './screenReceiveRates'
import { isBasicRenderDriver, screenGpu } from './screenGpu'

// O H.265 de uma live chegou e não decodificou neste aparelho
// (screenHevcDecodeGuard): o processo principal grava a marca, e a próxima
// abertura não anuncia o H.265 para receber; a telemetria da live leva o
// evento `decoder_falhou`. Sem aviso na tela por enquanto (texto de UI precisa
// de aprovação). Ver docs/adr/0073.

interface HevcFailureApi {
  hevcDecodeFailed(): void
}

/** streamerId → detalhe do evento, até a próxima amostra da live levar. */
const pending = new Map<string, string>()

const decimal = (value: number): string =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export function hevcFailureDetail(rates: ReceiveRates): string {
  return `h265: ${decimal(rates.receivedFps)} chegam, ${decimal(rates.decodedFps)} decodificados por segundo`
}

const appApi = (): HevcFailureApi | undefined =>
  typeof window === 'undefined' ? undefined : window.api?.screenShare

/**
 * false = não conta: com o driver de vídeo fora do ar nada decodifica na
 * placa, e a marca tiraria o H.265 de uma placa boa.
 */
export function reportHevcDecodeFailure(
  streamerId: string,
  rates: ReceiveRates,
  gpu = screenGpu(),
  api: HevcFailureApi | undefined = appApi()
): boolean {
  if (isBasicRenderDriver(gpu)) return false
  api?.hevcDecodeFailed()
  pending.set(streamerId, hevcFailureDetail(rates))
  return true
}

/** O evento da live desse streamer (telemetryReporter); leva e limpa. */
export function takeHevcDecodeFailure(streamerId: string): string | null {
  const detail = pending.get(streamerId) ?? null
  pending.delete(streamerId)
  return detail
}
