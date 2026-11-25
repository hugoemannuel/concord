import { videoRtp, type ScreenStatsInput } from '../../call/lib/screenStats'
import {
  codecSubtype,
  implementationKind,
  num,
  text,
  type Stat
} from '../../call/lib/screenStatsFormat'
import { emptySample, type TelemetrySample } from './telemetryTypes'

// Telemetria das lives e calls: transforma o getStats() (o mesmo que o painel
// da live lê) numa amostra pequena para o backend. Contadores vão como a
// diferença desde a leitura anterior; a primeira leitura é só a base. Puro.

/** O que a próxima leitura precisa para calcular as diferenças. */
export interface SampleCounters {
  timestamp: number
  bytes: number
  keyFrames: number
  pli: number
  nack: number
  freezes: number
  freezeMs: number
  dropped: number
  lost: number
  received: number
  /** Quadros codificados (envio) ou decodificados (recepção); -1 = o navegador não conta. */
  frames: number
  /** Recepção: quadros que chegaram. */
  framesReceived: number
  /** Envio: quadros que a captura entregou (media-source). */
  captured: number
  /** ms gastos no codec (totalEncodeTime/totalDecodeTime). */
  codecMs: number
  /** Call: os contadores de cada voz recebida, pelo id da faixa (stat.id). */
  voices?: Record<string, VoiceCounters>
}

/** Uma voz recebida: amostras sintetizadas (sem o silêncio), recebidas e pacotes. */
export interface VoiceCounters {
  concealed: number
  samples: number
  lost: number
  received: number
}

export interface SampleResult {
  sample: TelemetrySample
  counters: SampleCounters
  /** Minha live: por que o controlador desceu (ScreenAdaptView.reason); não vai na amostra. */
  stepReason?: string | null
}

export const n0 = (value: unknown): number => num(value) ?? 0

/** Os nomes dos contadores no envio e na recepção. */
export interface CounterKeys {
  bytes: string
  keyFrames: string
  frames: string
  codecTime: string
}

export const SEND: CounterKeys = {
  bytes: 'bytesSent',
  keyFrames: 'keyFramesEncoded',
  frames: 'framesEncoded',
  codecTime: 'totalEncodeTime'
}
const RECEIVE: CounterKeys = {
  bytes: 'bytesReceived',
  keyFrames: 'keyFramesDecoded',
  frames: 'framesDecoded',
  codecTime: 'totalDecodeTime'
}
export const NO_KEYS: CounterKeys = { bytes: '', keyFrames: '', frames: '', codecTime: '' }

export function countersOf(stat: Stat, keys: CounterKeys, source?: Stat): SampleCounters {
  const { bytes: bytesKey, keyFrames: keyFramesKey } = keys
  return {
    timestamp: n0(stat.timestamp),
    bytes: n0(stat[bytesKey]),
    keyFrames: n0(stat[keyFramesKey]),
    pli: n0(stat.pliCount) + n0(stat.firCount),
    nack: n0(stat.nackCount),
    freezes: n0(stat.freezeCount),
    freezeMs: Math.round(n0(stat.totalFreezesDuration) * 1000),
    dropped: n0(stat.framesDropped),
    lost: n0(stat.packetsLost),
    received: n0(stat.packetsReceived),
    frames: num(stat[keys.frames]) ?? -1,
    framesReceived: n0(stat.framesReceived),
    captured: n0(source?.frames),
    codecMs: n0(stat[keys.codecTime]) * 1000
  }
}

type CounterKey = Exclude<keyof SampleCounters, 'voices'>
export type Deltas = Record<CounterKey, number>

/** Diferenças no intervalo (zeros na primeira leitura; contador que voltou = 0). */
export function deltas(now: SampleCounters, prev: SampleCounters | null): Deltas {
  const out = {} as Deltas
  for (const key of Object.keys(now) as (keyof SampleCounters)[]) {
    if (key === 'voices') continue
    out[key] = prev ? Math.max(0, now[key] - prev[key]) : 0
  }
  return out
}

const round1 = (value: number): number => Math.round(value * 10) / 10

/** Por segundo no intervalo (null sem intervalo). */
export function perSecond(count: number, d: Deltas): number | null {
  return d.timestamp > 0 ? round1((count * 1000) / d.timestamp) : null
}

/**
 * Quadros por segundo no intervalo (codificados ou decodificados). Primeira
 * leitura, contador ausente ou que voltou (troca de camada/ssrc): o do momento.
 */
function intervalFps(
  stat: Stat,
  now: SampleCounters,
  prev: SampleCounters | null,
  d: Deltas
): number | null {
  const counted = prev !== null && now.frames >= 0 && now.frames >= prev.frames
  return (counted ? perSecond(d.frames, d) : null) ?? num(stat.framesPerSecond)
}

/** ms por quadro no codec, no intervalo. */
function codecMsPerFrame(d: Deltas): number | null {
  return d.frames > 0 ? round1(d.codecMs / d.frames) : null
}

function bitrateKbps(d: Deltas): number | null {
  return d.timestamp > 0 ? Math.round((d.bytes * 8) / d.timestamp) : null
}

export function lossPct(d: { lost: number; received: number }): number | null {
  const total = d.lost + d.received
  return total > 0 ? Math.round((d.lost * 10000) / total) / 100 : null
}

export const ms = (seconds: unknown): number | null => {
  const value = num(seconds)
  return value === null ? null : Math.round(value * 1000)
}

/** Par ICE escolhido: udp, tcp ou relay (TURN); '' sem dado. */
export function transportOf(report: RTCStatsReport): string {
  const pair = selectedPair(report)
  const local =
    typeof pair?.localCandidateId === 'string'
      ? (report.get(pair.localCandidateId) as Stat | undefined)
      : undefined
  if (local?.candidateType === 'relay') return 'relay'
  return text(local?.protocol) ?? ''
}

function selectedPair(report: RTCStatsReport): Stat | undefined {
  let selected: Stat | undefined
  let nominated: Stat | undefined
  report.forEach((stat: Stat) => {
    if (stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string') {
      selected = report.get(stat.selectedCandidatePairId) as Stat | undefined
    }
    if (stat.type === 'candidate-pair' && stat.nominated && stat.state === 'succeeded')
      nominated = stat
  })
  return selected ?? nominated
}

export function rttMs(report: RTCStatsReport): number | null {
  return ms(selectedPair(report)?.currentRoundTripTime)
}

export function hardwareOf(stat: Stat, nameKey: string, efficientKey: string): boolean | null {
  const kind = implementationKind(
    text(stat[nameKey]) ?? '',
    stat[efficientKey] as boolean | undefined
  )
  return kind === null ? null : kind === 'Hardware'
}

export interface Reading {
  stat: Stat
  report: RTCStatsReport
  now: SampleCounters
  prev: SampleCounters | null
  d: Deltas
}

export function reading(
  stat: Stat,
  report: RTCStatsReport,
  now: SampleCounters,
  prev: SampleCounters | null
): Reading {
  return { stat, report, now, prev, d: deltas(now, prev) }
}

export function videoBase({ stat, report, now, prev, d }: Reading): TelemetrySample {
  return {
    ...emptySample(),
    seconds: d.timestamp / 1000,
    codec: codecSubtype(report, stat) ?? '',
    width: num(stat.frameWidth),
    height: num(stat.frameHeight),
    fps: intervalFps(stat, now, prev, d),
    codec_ms: codecMsPerFrame(d),
    bitrate_kbps: bitrateKbps(d),
    key_frames: d.keyFrames,
    pli: d.pli,
    nack: d.nack,
    transport: transportOf(report),
    rtt_ms: rttMs(report)
  }
}

/** A live de outra pessoa que estou assistindo. */
export function watchSample(
  input: ScreenStatsInput,
  prev: SampleCounters | null
): SampleResult | null {
  const stat = videoRtp(input.report, 'inbound-rtp', 'bytesReceived')
  if (!stat) return null
  const read = reading(stat, input.report, countersOf(stat, RECEIVE), prev)
  const { d } = read
  return {
    counters: read.now,
    sample: {
      ...videoBase(read),
      hardware: hardwareOf(stat, 'decoderImplementation', 'powerEfficientDecoder'),
      recv_fps: prev ? perSecond(d.framesReceived, d) : null,
      loss_pct: lossPct(d),
      jitter_ms: ms(stat.jitter),
      freezes: d.freezes,
      freeze_ms: d.freezeMs,
      frames_dropped: d.dropped,
      paused: input.streamState === 'paused'
    }
  }
}
