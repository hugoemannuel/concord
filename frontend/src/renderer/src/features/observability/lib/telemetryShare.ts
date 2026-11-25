import type { ScreenStatsInput } from '../../call/lib/screenStats'
import { videoRtp } from '../../call/lib/screenStats'
import { encoderInfoFromReport } from '../../call/lib/screenEncoderInfo'
import { codecSubtype, num, text, type Stat } from '../../call/lib/screenStatsFormat'
import {
  countersOf,
  hardwareOf,
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

/** A minha live. `stepChanges`: trocas de degrau desde a última amostra. */
export function shareSample(
  input: ScreenStatsInput,
  prev: SampleCounters | null,
  stepChanges: number
): SampleResult | null {
  const stat = videoRtp(input.report, 'outbound-rtp', 'bytesSent')
  if (!stat) return null
  const source = mediaSource(input.report, stat)
  const read = reading(stat, input.report, countersOf(stat, SEND, source), prev)
  const base = videoBase(read)
  const target = chosenTarget(input.quality?.chosen)
  return {
    counters: read.now,
    stepReason: input.quality?.reason ?? null,
    sample: {
      ...base,
      ...layersOf(input.report, base.codec),
      hardware: hardwareOf(stat, 'encoderImplementation', 'powerEfficientEncoder'),
      capture_fps: captureFps(read, source),
      target_height: target.height,
      target_fps: target.fps ?? input.requestedFps,
      limitation: text(stat.qualityLimitationReason) ?? '',
      step: input.quality?.step ?? null,
      step_changes: stepChanges
    }
  }
}
