import type { Stat, StatsReport } from '../../call/lib/callStatsSource'

// Peças para ler o getStats() (cópia adaptada do desktop, call/lib/screenStatsFormat e screenStats): campos,
// codec e onde ele roda. No Android o codificador é o do MediaCodec: `c2.qti.avc.encoder`, `OMX.Exynos...` na
// placa; `c2.android.*` e `OMX.google.*` são os de software do próprio Android. Puro.

export type { Stat, StatsReport }

const SOFTWARE = /c2\.android\.|omx\.google\.|fallback|libvpx|openh264|ffmpeg|libaom|dav1d|software/i
const HARDWARE = /mediacodec|\bc2\.|\bomx\.|accelerator|external/i

export const num = (value: unknown): number | null => (typeof value === 'number' ? value : null)
export const text = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)

/** true = na placa, false = no processador, null = o WebRTC não conta. */
export function onHardware(name: string, powerEfficient: unknown): boolean | null {
  if (typeof powerEfficient === 'boolean') return powerEfficient
  if (SOFTWARE.test(name)) return false
  return HARDWARE.test(name) ? true : null
}

/** "H265": o subtipo do mimeType do codec desse RTP, em maiúsculas. */
export function codecSubtype(report: StatsReport, stat: Stat): string | null {
  const codec = typeof stat.codecId === 'string' ? (report.get(stat.codecId) as Stat | undefined) : undefined
  const mime = text(codec?.mimeType)
  return mime ? mime.slice(mime.indexOf('/') + 1).toUpperCase() : null
}

/** O RTP de vídeo que mais trafega (o ativo antes do pausado). */
export function videoRtp(report: StatsReport, type: string, bytesKey: string): Stat | null {
  let best: Stat | null = null
  let idle: Stat | null = null
  report.forEach((stat) => {
    if (stat.type !== type || stat.kind !== 'video') return
    if (stat.active === false) idle ??= stat
    else if (!best || (num(stat[bytesKey]) ?? 0) > (num(best[bytesKey]) ?? 0)) best = stat
  })
  return best ?? idle
}
