import { num, type Stat } from '../../call/lib/screenStatsFormat'
import {
  countersOf,
  deltas,
  lossPct,
  ms,
  n0,
  NO_KEYS,
  rttMs,
  transportOf,
  type SampleCounters,
  type SampleResult,
  type VoiceCounters
} from './telemetrySample'
import { emptySample } from './telemetryTypes'

// Telemetria da voz das calls: o que o servidor diz que recebe de mim (perda
// média do intervalo, jitter), o RTT, o par ICE e o que eu ouço de cada voz. Puro.

function remoteInbound(report: RTCStatsReport): Stat | undefined {
  let found: Stat | undefined
  report.forEach((stat: Stat) => {
    if (stat.type === 'remote-inbound-rtp') found ??= stat
  })
  return found
}

/** A hora da leitura: o maior timestamp (o do remote-inbound-rtp é o do último RTCP). */
function readAt(report: RTCStatsReport): number {
  let latest = 0
  report.forEach((stat: Stat) => {
    latest = Math.max(latest, n0(stat.timestamp))
  })
  return latest
}

/**
 * Os contadores da subida (o que o servidor diz que recebeu de mim): perdidos e
 * recebidos. Sem packetsReceived no relatório, recebidos = mandados − perdidos.
 */
function uplink(report: RTCStatsReport, remote: Stat | undefined): { lost: number; received: number } {
  const lost = n0(remote?.packetsLost)
  const received = num(remote?.packetsReceived)
  if (received !== null) return { lost, received }
  const local =
    typeof remote?.localId === 'string' ? (report.get(remote.localId) as Stat | undefined) : undefined
  return { lost, received: Math.max(0, n0(local?.packetsSent) - lost) }
}

/** Voz com menos pacotes que isso no intervalo (calada, mudo) não entra na perda. */
const MIN_VOICE_PACKETS = 100

/** O que eu ouço: cada voz recebida pelo id da faixa (o vídeo não entra). */
function heard(report: RTCStatsReport): Record<string, VoiceCounters> {
  const voices: Record<string, VoiceCounters> = {}
  report.forEach((stat: Stat) => {
    if (stat.type !== 'inbound-rtp' || stat.kind !== 'audio') return
    voices[String(stat.id)] = {
      concealed: n0(stat.concealedSamples) - n0(stat.silentConcealedSamples),
      samples: n0(stat.totalSamplesReceived),
      lost: n0(stat.packetsLost),
      received: n0(stat.packetsReceived)
    }
  })
  return voices
}

/**
 * A diferença de cada voz presente nas duas leituras: a que entrou ou saiu no
 * intervalo fica de fora (não zera nem infla a soma).
 */
function voiceDeltas(now: SampleCounters, prev: SampleCounters | null): VoiceCounters[] {
  const before = prev?.voices ?? {}
  return Object.entries(now.voices ?? {}).flatMap(([id, v]) => {
    const p = before[id]
    if (!p) return []
    return [
      {
        concealed: Math.max(0, v.concealed - p.concealed),
        samples: Math.max(0, v.samples - p.samples),
        lost: Math.max(0, v.lost - p.lost),
        received: Math.max(0, v.received - p.received)
      }
    ]
  })
}

/** % das amostras recebidas no intervalo que foram sintetizadas (voz robotizada/cortes). */
function concealedPct(voices: VoiceCounters[]): number | null {
  const concealed = voices.reduce((sum, v) => sum + v.concealed, 0)
  const samples = voices.reduce((sum, v) => sum + v.samples, 0)
  return samples > 0 ? Math.round((concealed * 10000) / samples) / 100 : null
}

/**
 * Perda até mim: a menor entre as vozes com tráfego. A perda na subida de quem
 * fala chega a todos os ouvintes; só quando todas as vozes perdem é a minha rede.
 */
function heardLossPct(voices: VoiceCounters[]): number | null {
  const losses = voices
    .filter((v) => v.lost + v.received >= MIN_VOICE_PACKETS)
    .map((v) => lossPct(v) ?? 0)
  return losses.length > 0 ? Math.min(...losses) : null
}

/**
 * A voz da call: o que o servidor diz que recebe de mim (perda, jitter), o
 * RTT e o que eu ouço das outras pessoas (áudio sintetizado, perda até mim),
 * voz a voz (ADR 0032, emenda de 2026-11-25).
 */
export function callSample(report: RTCStatsReport, last: SampleCounters | null): SampleResult {
  // Leitura anterior vazia (sem relatório): esta é a base, não um intervalo.
  const prev = last && last.timestamp > 0 ? last : null
  const remote = remoteInbound(report)
  const counters = {
    ...countersOf({}, NO_KEYS),
    ...uplink(report, remote),
    voices: heard(report),
    timestamp: readAt(report)
  }
  const d = deltas(counters, prev)
  const voiceD = voiceDeltas(counters, prev)
  const elapsed = prev && counters.timestamp > prev.timestamp ? d.timestamp : 0
  return {
    counters,
    sample: {
      ...emptySample(),
      seconds: elapsed / 1000,
      transport: transportOf(report),
      rtt_ms: rttMs(report),
      loss_pct: prev ? lossPct(d) : null,
      jitter_ms: ms(remote?.jitter),
      concealed_pct: concealedPct(voiceD),
      recv_loss_pct: heardLossPct(voiceD)
    }
  }
}
