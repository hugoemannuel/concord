import type { ScreenVideoCodec } from './screenCodecSupport'
import { codecSubtype, num, type Stat } from './screenStatsFormat'

// Vigia o codec que sai de fato pelo envio da tela. Quando o codificador da
// placa falha e não há o mesmo codec no processador (H.265, AV1), o navegador
// troca sozinho para outro codec negociado (VP8) na mesma faixa; quem assiste
// negociou o publicado e fica com a tela preta. Quem transmite republica num
// codec seguro (ver ScreenSender). Ver docs/adr/0048. Puro.

const CODECS: Record<string, ScreenVideoCodec> = { AV1: 'av1', H265: 'h265', H264: 'h264', VP8: 'vp8' }

/** Leituras seguidas fora do publicado antes de avisar (a cada ADAPT.tickMs). */
const STRIKES = 2

/** O codec do envio de vídeo ativo que mais trafegou; null = sem envio ou codec. */
export function sentCodec(report: RTCStatsReport): ScreenVideoCodec | null {
  let best: Stat | null = null
  report.forEach((stat: Stat) => {
    if (stat.type !== 'outbound-rtp' || stat.kind !== 'video' || stat.active === false) return
    if (!best || (num(stat.bytesSent) ?? 0) > (num(best.bytesSent) ?? 0)) best = stat
  })
  const subtype = best ? codecSubtype(report, best) : null
  return (subtype && CODECS[subtype]) || null
}

export class CodecGuard {
  private strikes = 0

  constructor(private readonly published: ScreenVideoCodec) {}

  /** O codec para o qual o navegador trocou sozinho (confirmado), ou null. */
  check(report: RTCStatsReport): ScreenVideoCodec | null {
    const sent = sentCodec(report)
    if (!sent) return null
    this.strikes = sent === this.published ? 0 : this.strikes + 1
    return this.strikes >= STRIKES ? sent : null
  }
}
