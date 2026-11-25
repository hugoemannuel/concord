import { videoRtp, type ScreenStatsInput } from '../../call/lib/screenStats'
import { encoderInfoFromReport } from '../../call/lib/screenEncoderInfo'
import { codecSubtype, num, text, type Stat } from '../../call/lib/screenStatsFormat'
import {
  countersOf,
  hardwareOf,
  lossPct,
  ms,
  n0,
  perSecond,
  reading,
  SEND,
  videoBase,
  type Reading,
  type SampleCounters,
  type SampleResult
} from './telemetrySample'

// Telemetria da minha live: o envio (outbound-rtp principal), a captura
// (media-source) e o degrau do controlador. Puro.

/** "1080p 60" → 1080 e 60 (o que a pessoa escolheu). */
function chosenTarget(label: string | undefined): { height: number | null; fps: number | null } {
  const match = /(\d+)p (\d+)/.exec(label ?? '')
  return match ? { height: Number(match[1]), fps: Number(match[2]) } : { height: null, fps: null }
}

/** Camadas do principal saindo (com a extra de 720p, 2) e se a reserva está saindo. */
function layersOf(report: RTCStatsReport, primary: string): { layers: number; backup: boolean } {
  let layers = 0
  report.forEach((stat: Stat) => {
    if (stat.type === 'outbound-rtp' && stat.kind === 'video' && stat.active !== false) {
      if (codecSubtype(report, stat) === primary) layers++
    }
  })
  const backup = encoderInfoFromReport(report, null, primary).encoders.some((e) => e.backup)
  return { layers, backup }
}

/** A media-source (captura) do envio: quadros que a tela entregou ao codificador. */
function mediaSource(report: RTCStatsReport, stat: Stat): Stat | undefined {
  return typeof stat.mediaSourceId === 'string'
    ? (report.get(stat.mediaSourceId) as Stat | undefined)
    : undefined
}

function captureFps({ prev, d }: Reading, source: Stat | undefined): number | null {
  if (!source) return null
  return (prev ? perSecond(d.captured, d) : null) ?? num(source.framesPerSecond)
}

/** O que o servidor diz que recebeu do envio principal (o remote-inbound-rtp dele). */
function remoteOf(report: RTCStatsReport, stat: Stat): Stat | undefined {
  let found: Stat | undefined
  report.forEach((s: Stat) => {
    if (s.type === 'remote-inbound-rtp' && s.localId === stat.id) found = s
  })
  return found
}

/** Perdidos e recebidos na subida (recebidos = mandados − perdidos); zeros sem o relatório. */
function uplink(stat: Stat, remote: Stat | undefined): { lost: number; received: number } {
  if (!remote) return { lost: 0, received: 0 }
  const lost = n0(remote.packetsLost)
  return { lost, received: Math.max(0, n0(stat.packetsSent) - lost) }
}

/**
 * Perda média do intervalo: a leitura anterior precisa ser da mesma camada
 * (o principal muda quando o dynacast pausa a de cima) e ter o relatório.
 */
function uplinkLoss({ now, prev, d }: Reading, remote: Stat | undefined): number | null {
  const same = prev !== null && prev.ssrc === now.ssrc && prev.lost + prev.received > 0
  return remote && same ? lossPct(d) : null
}

/** QP médio dos quadros codificados no intervalo; null sem qpSum ou contador que voltou. */
function intervalQp({ now, prev, d }: Reading): number | null {
  const counted = prev !== null && prev.qp >= 0 && now.qp >= prev.qp && d.frames > 0
  return counted ? Math.round(d.qp / d.frames) : null
}

/** A minha live. `stepChanges`: trocas de degrau desde a última amostra. */
export function shareSample(
  input: ScreenStatsInput,
  prev: SampleCounters | null,
  stepChanges: number
): SampleResult | null {
  const stat = videoRtp(input.report, 'outbound-rtp', 'bytesSent')
  if (!stat) return null
  const source = mediaSource(input.report, stat)
  const remote = remoteOf(input.report, stat)
  const counters = { ...countersOf(stat, SEND, source), ...uplink(stat, remote) }
  const read = reading(stat, input.report, counters, prev)
  const base = videoBase(read)
  const target = chosenTarget(input.quality?.chosen)
  return {
    counters: read.now,
    stepReason: input.quality?.reason ?? null,
    implementation: text(stat.encoderImplementation) ?? null,
    sample: {
      ...base,
      ...layersOf(input.report, base.codec),
      hardware: hardwareOf(stat, 'encoderImplementation', 'powerEfficientEncoder'),
      capture_fps: captureFps(read, source),
      target_height: target.height,
      target_fps: target.fps ?? input.requestedFps,
      limitation: text(stat.qualityLimitationReason) ?? '',
      step: input.quality?.step ?? null,
      step_changes: stepChanges,
      loss_pct: uplinkLoss(read, remote),
      jitter_ms: ms(remote?.jitter),
      qp: intervalQp(read),
      source_width: input.source?.width ?? null,
      source_height: input.source?.height ?? null,
      surface: input.source?.surface ?? null
    }
  }
}
