import { num, type Stat, type StatsReport } from './statsFormat'
import { countersOf, deltas, lossPct, ms, n0, NO_KEYS, rttMs, transportOf, type Deltas, type SampleCounters, type SampleResult } from './telemetrySample'
import { emptySample } from './telemetryTypes'

// Telemetria da voz das calls (cópia do desktop, observability/lib/telemetryCall): o que o servidor diz que
// recebe de mim (perda, jitter), o RTT, o par ICE e o que eu ouço das outras pessoas. Puro.

function remoteInbound(report: StatsReport): Stat | undefined {
  let found: Stat | undefined
  report.forEach((stat) => {
    if (stat.type === 'remote-inbound-rtp') found ??= stat
  })
  return found
}

function fractionPct(value: unknown): number | null {
  const fraction = num(value)
  return fraction === null ? null : Math.round(fraction * 10000) / 100
}

/** O que eu ouço: a soma das vozes recebidas (o vídeo não entra). */
function heard(report: StatsReport): Pick<SampleCounters, 'concealed' | 'samples' | 'lost' | 'received'> & { timestamp: number } {
  const sum = { concealed: 0, samples: 0, lost: 0, received: 0, timestamp: 0 }
  report.forEach((stat) => {
    if (stat.type !== 'inbound-rtp' || stat.kind !== 'audio') return
    sum.concealed += n0(stat.concealedSamples) - n0(stat.silentConcealedSamples)
    sum.samples += n0(stat.totalSamplesReceived)
    sum.lost += n0(stat.packetsLost)
    sum.received += n0(stat.packetsReceived)
    sum.timestamp = Math.max(sum.timestamp, n0(stat.timestamp))
  })
  return sum
}

/** % das amostras recebidas no intervalo que foram sintetizadas (voz robotizada/cortes). */
function concealedPct(d: Deltas): number | null {
  return d.samples > 0 ? Math.round((d.concealed * 10000) / d.samples) / 100 : null
}

/** A voz da call. Uma voz que entra ou sai no intervalo pode zerar a diferença daquela leitura. */
export function callSample(report: StatsReport, prev: SampleCounters | null): SampleResult {
  const remote = remoteInbound(report)
  const { timestamp: heardAt, ...audio } = heard(report)
  const counters = { ...countersOf({}, NO_KEYS), ...audio, timestamp: n0(remote?.timestamp) || heardAt }
  const d = deltas(counters, prev)
  const elapsed = prev && counters.timestamp > prev.timestamp ? d.timestamp : 0
  return {
    counters,
    sample: {
      ...emptySample(),
      seconds: elapsed / 1000,
      transport: transportOf(report),
      rtt_ms: rttMs(report),
      loss_pct: fractionPct(remote?.fractionLost),
      jitter_ms: ms(remote?.jitter),
      concealed_pct: prev ? concealedPct(d) : null,
      recv_loss_pct: prev ? lossPct(d) : null
    }
  }
}
