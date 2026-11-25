import type { NativeLiveAvailability, NativeLiveQuality } from '../../../../../shared/nativeLive'
import { captureSize, screenEncoding, type ScreenShareQuality } from './screenShareQuality'

// Quando a live sai pelo motor nativo (helper concord-live, docs/adr/0031) e
// como o degrau do app vira o comando do helper. Puro, para testar.

export const NATIVE_LIVE_KEY = 'salinha:native-live'

/** null = automático (liga sozinho só onde o Chromium não codifica na placa). */
export function loadNativeLivePref(): boolean | null {
  try {
    const value = localStorage.getItem(NATIVE_LIVE_KEY)
    return value === '1' ? true : value === '0' ? false : null
  } catch {
    return null
  }
}

export function saveNativeLivePref(on: boolean): void {
  try {
    localStorage.setItem(NATIVE_LIVE_KEY, on ? '1' : '0')
  } catch {
    /* Sem armazenamento: vale só nesta escolha. */
  }
}

/**
 * Liga o motor nativo? Precisa do helper; a escolha da pessoa vale, e no
 * automático só liga com placa NVIDIA no Linux (o Chromium codificaria no
 * processador). Falhou nesta sessão do app: segue pelo Chromium.
 */
export function nativeLiveWanted(
  pref: boolean | null,
  availability: NativeLiveAvailability | null,
  failedBefore: boolean
): boolean {
  if (!availability?.available || failedBefore) return false
  return pref ?? availability.nvidia
}

/** O interruptor do modal: o que vale agora (a escolha, ou o automático). */
export function nativeLiveToggleValue(
  pref: boolean | null,
  availability: NativeLiveAvailability | null
): boolean {
  return nativeLiveWanted(pref, availability, false)
}

/**
 * O degrau em pixels/fps/bitrate, igual ao da live do Chromium. Sem a fonte
 * (antes do seletor), a caixa do preset; o helper nunca amplia.
 */
export function nativeQuality(
  quality: ScreenShareQuality,
  source: { width?: number; height?: number } = {}
): NativeLiveQuality {
  const { width, height } = captureSize(quality.resolution, source)
  const { maxBitrate, maxFramerate } = screenEncoding(quality, source)
  return { width, height, fps: maxFramerate, maxBitrate }
}

/** As estatísticas do helper (nomes do WebRTC) como um RTCStatsReport. */
export function nativeStatsReport(stats: Record<string, unknown>[]): RTCStatsReport {
  return new Map(stats.map((stat, index) => [String(stat.id ?? index), stat])) as unknown as RTCStatsReport
}

/**
 * O tempo de cada estatística é a hora em que chegaram (ms, como o getStats()
 * do navegador). O helper manda o `timestamp` do libwebrtc em µs
 * (`RTCStats::ToJson`), e o app lia como ms: fps, captura, kbps e duração da
 * live nativa saíam 1000 vezes menores (ADR 0073). Com a hora de chegada não
 * importa a unidade nem o relógio do helper, inclusive se ele mudar.
 */
export function stampNativeStats(
  stats: Record<string, unknown>[],
  receivedAt: number
): Record<string, unknown>[] {
  return stats.map((stat) => ({ ...stat, timestamp: receivedAt }))
}
