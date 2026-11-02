import type { ScreenAdaptView } from '../store/screenAdaptStore'
import type { CodecFallback } from '../store/screenCodecFallbackStore'
import {
  bitrate,
  codecImplementation,
  codecName,
  codecSubtype,
  fps,
  num,
  recoveryRows,
  resolution,
  text,
  type ScreenStatsSample,
  type Stat,
  type StatRow
} from './screenStatsFormat'
import { receiverNote, receiverRows } from './screenStatsReceiver'
import { backupRows, encoderInfoFromReport, type ScreenEncoderInfo } from './screenEncoderInfo'

export { codecImplementation, type ScreenStatsSample, type StatRow }

// Estatísticas da live (painel no canto do vídeo): transforma o getStats() do
// envio (quem transmite) ou da recepção (quem assiste) em linhas prontas para a
// UI. Puro: quem lê o RTCStatsReport e guarda a leitura anterior é o hook.

/** Entrada de uma leitura: o relatório e o estado da publicação no SDK. */
export interface ScreenStatsInput {
  /** A própria transmissão (envio) ou a de outra pessoa (recepção). */
  local: boolean
  report: RTCStatsReport
  /** Recepção: false = vídeo desligado por mim (janela oculta, fora de vista). */
  enabled: boolean
  /** Recepção: 'paused' = o servidor parou de mandar (conexão fraca). */
  streamState: string
  /** Envio: fps pedido na qualidade da transmissão. */
  requestedFps: number | null
  /** Envio: degrau saindo agora (o controlador pode ter descido). */
  quality?: ScreenAdaptView | null
  /** Recepção: o codificador de quem transmite (null = ainda não respondeu). */
  encoder?: ScreenEncoderInfo | null
  /** Recepção: o que falta para a placa de vídeo decodificar (Linux/NVIDIA sem driver). */
  driverHint?: string | null
  /** Envio: a live trocou de codec porque o publicado falhou (ver screenCodecGuard). */
  codecFallback?: CodecFallback | null
}

export interface ScreenStatsView {
  rows: StatRow[]
  /** Aviso no topo do painel (pausada, sem dados) ou null. */
  status: string | null
  /** Nota no pé do painel (o que instalar para decodificar na placa de vídeo) ou null. */
  note?: string | null
}

export type LivePauseReason = 'offscreen' | 'connection'

const IDLE_TEXT = 'Envio pausado: ninguém está vendo a live agora'

const PAUSE_TEXT: Record<LivePauseReason, string> = {
  offscreen: 'Vídeo pausado (fora de vista)',
  connection: 'Pausada pela sua conexão'
}

const CODEC_LABEL: Record<CodecFallback['from'], string> = {
  av1: 'AV1',
  h265: 'H.265',
  h264: 'H.264',
  vp8: 'VP8'
}

/** "H.265 falhou, usando H.264" (null = não trocou). */
function fallbackText(fallback: CodecFallback | null | undefined): string | null {
  if (!fallback) return null
  return `${CODEC_LABEL[fallback.from]} falhou, usando ${CODEC_LABEL[fallback.to]}`
}

const LIMITATION: Record<string, string> = {
  none: 'Nenhuma',
  cpu: 'CPU',
  bandwidth: 'Banda',
  other: 'Outra'
}

export function limitationLabel(reason: string | undefined): string {
  return (reason && LIMITATION[reason]) || '—'
}

/** Desligado por mim (fora de vista) vem antes da pausa do servidor. */
export function livePauseReason(enabled: boolean, streamState: string): LivePauseReason | null {
  if (!enabled) return 'offscreen'
  return streamState === 'paused' ? 'connection' : null
}

/**
 * O RTP de vídeo que está mandando/recebendo (com codec de reserva, o ativo que
 * mais trafegou). Nenhum ativo: o pausado (o dynacast pausa o envio quando
 * ninguém está vendo a live), para o painel dizer isso em vez de "sem dados".
 */
export function videoRtp(report: RTCStatsReport, type: string, bytesKey: string): Stat | null {
  let best: Stat | null = null
  let idle: Stat | null = null
  report.forEach((stat: Stat) => {
    if (stat.type !== type || stat.kind !== 'video') return
    if (stat.active === false) idle ??= stat
    else if (!best || (num(stat[bytesKey]) ?? 0) > (num(best[bytesKey]) ?? 0)) best = stat
  })
  return best ?? idle
}

function sampleOf(stat: Stat, bytesKey: string, framesKey: string): ScreenStatsSample {
  return {
    timestamp: num(stat.timestamp) ?? 0,
    bytes: num(stat[bytesKey]) ?? 0,
    frames: num(stat[framesKey]) ?? 0,
    qpSum: num(stat.qpSum),
    packetsReceived: num(stat.packetsReceived) ?? 0,
    packetsLost: num(stat.packetsLost) ?? 0
  }
}

function averageQp(now: ScreenStatsSample, prev: ScreenStatsSample | null): StatRow[] {
  if (now.qpSum === null || !prev || prev.qpSum === null || now.frames <= prev.frames) return []
  return [
    {
      label: 'QP médio',
      value: String(Math.round((now.qpSum - prev.qpSum) / (now.frames - prev.frames)))
    }
  ]
}

const REDUCED_BY: Record<string, string> = { cpu: 'pelo PC', bandwidth: 'pela conexão' }

/** "720p 60 (de 1080p 60, pela conexão)": o degrau saindo e por que desceu. */
function qualityRows(view: ScreenAdaptView | null | undefined): StatRow[] {
  if (!view) return []
  const why = view.reason ? `, ${REDUCED_BY[view.reason]}` : ''
  const value = view.reduced ? `${view.effective} (de ${view.chosen}${why})` : view.effective
  return [{ label: 'Qualidade', value }]
}

function senderRows(
  input: ScreenStatsInput,
  stat: Stat,
  now: ScreenStatsSample,
  prev: ScreenStatsSample | null
): StatRow[] {
  const requested = input.requestedFps === null ? '' : ` de ${input.requestedFps}`
  const encoder = codecImplementation(
    text(stat.encoderImplementation),
    stat.powerEfficientEncoder as boolean | undefined
  )
  // O principal é o que mais trafegou (videoRtp); os outros codecs ativos são a reserva.
  const encoders = encoderInfoFromReport(input.report, null, codecSubtype(input.report, stat) ?? '')
  return [
    ...qualityRows(input.quality),
    { label: 'Quadros', value: `${fps(stat)}${requested} fps` },
    { label: 'Resolução', value: resolution(stat) },
    { label: 'Taxa', value: bitrate(now, prev) },
    { label: 'Codec', value: codecName(input.report, stat, encoder) },
    { label: 'Codificador', value: encoder },
    ...backupRows(encoders),
    { label: 'Limitação', value: limitationLabel(text(stat.qualityLimitationReason)) },
    ...averageQp(now, prev),
    ...recoveryRows(stat, 'keyFramesEncoded')
  ]
}

/** Linhas do painel + a leitura que a próxima chamada recebe como `prev`. */
export function screenStatsView(
  input: ScreenStatsInput,
  prev: ScreenStatsSample | null
): { view: ScreenStatsView; sample: ScreenStatsSample | null } {
  const [type, bytesKey, framesKey] = input.local
    ? ['outbound-rtp', 'bytesSent', 'framesEncoded']
    : ['inbound-rtp', 'bytesReceived', 'framesDecoded']
  const stat = videoRtp(input.report, type, bytesKey)
  const pause = input.local ? null : livePauseReason(input.enabled, input.streamState)
  const pauseText = pause ? PAUSE_TEXT[pause] : stat?.active === false ? IDLE_TEXT : null
  if (!stat) return { view: { rows: [], status: pauseText ?? 'Ainda sem dados' }, sample: null }
  const now = sampleOf(stat, bytesKey, framesKey)
  if (input.local) {
    const status = pauseText ?? fallbackText(input.codecFallback)
    return { view: { rows: senderRows(input, stat, now, prev), status }, sample: now }
  }
  const rows = receiverRows(input.report, input.encoder ?? null, stat, now, prev)
  const note = receiverNote(stat, input.driverHint ?? null)
  return { view: { rows, status: pauseText, note }, sample: now }
}
