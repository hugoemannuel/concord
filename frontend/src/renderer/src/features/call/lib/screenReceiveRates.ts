// Uma leitura da live que estou assistindo, do jeito que os detectores do
// decodificador (screenHevcDecodeGuard, screenDecodeOverload) precisam:
// quadros chegando × decodificados, tempo por quadro e perda no intervalo.
// Puro: recebe o getStats() da recepção. Ver docs/adr/0073.

type Stat = Record<string, unknown>

const num = (value: unknown): number => (typeof value === 'number' ? value : 0)
const round1 = (value: number): number => Math.round(value * 10) / 10

/** Contadores acumulados (desde o começo da recepção). */
export interface ReceiveCounters {
  /** ms (o timestamp do getStats). */
  at: number
  /** 'h265', 'h264', 'vp8', 'av1'... */
  codec: string
  framesReceived: number
  framesDecoded: number
  decodeSeconds: number
  packetsReceived: number
  packetsLost: number
}

/** O intervalo entre duas leituras. */
export interface ReceiveRates {
  codec: string
  receivedFps: number
  decodedFps: number
  /** Tempo médio para decodificar um quadro; null = nenhum decodificado. */
  decodeMs: number | null
  /** Pacotes perdidos / esperados no intervalo (0 a 1). */
  lossRatio: number
}

function inboundVideo(report: RTCStatsReport): Stat | null {
  let best: Stat | null = null
  report.forEach((stat: Stat) => {
    if (stat.type !== 'inbound-rtp' || stat.kind !== 'video') return
    if (!best || num(stat.bytesReceived) > num(best.bytesReceived)) best = stat
  })
  return best
}

function codecOf(report: RTCStatsReport, stat: Stat): string {
  const codec = report.get(stat.codecId as string) as Stat | undefined
  const mime = typeof codec?.mimeType === 'string' ? codec.mimeType : ''
  return mime.split('/')[1]?.toLowerCase() ?? ''
}

export function receiveCounters(report: RTCStatsReport): ReceiveCounters | null {
  const stat = inboundVideo(report)
  if (!stat) return null
  return {
    at: num(stat.timestamp),
    codec: codecOf(report, stat),
    framesReceived: num(stat.framesReceived),
    framesDecoded: num(stat.framesDecoded),
    decodeSeconds: num(stat.totalDecodeTime),
    packetsReceived: num(stat.packetsReceived),
    packetsLost: num(stat.packetsLost)
  }
}

/** null = não dá para medir (primeira leitura, codec trocado, contador zerado). */
export function receiveRates(
  prev: ReceiveCounters | null,
  now: ReceiveCounters
): ReceiveRates | null {
  if (!prev || prev.codec !== now.codec) return null
  const seconds = (now.at - prev.at) / 1000
  const received = now.framesReceived - prev.framesReceived
  const decoded = now.framesDecoded - prev.framesDecoded
  if (seconds <= 0 || received < 0 || decoded < 0) return null
  const lost = Math.max(0, now.packetsLost - prev.packetsLost)
  const expected = lost + Math.max(0, now.packetsReceived - prev.packetsReceived)
  return {
    codec: now.codec,
    receivedFps: round1(received / seconds),
    decodedFps: round1(decoded / seconds),
    decodeMs: decoded > 0 ? round1(((now.decodeSeconds - prev.decodeSeconds) / decoded) * 1000) : null,
    lossRatio: expected > 0 ? lost / expected : 0
  }
}
