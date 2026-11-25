import type { ScreenStatsInput } from '../../call/lib/callStatsSource'
import { codecSubtype, num, onHardware, text, videoRtp, type Stat, type StatsReport } from './statsFormat'
import { emptySample, type TelemetrySample } from './telemetryTypes'

// Telemetria das lives e calls (cópia adaptada do desktop, observability/lib/telemetrySample): transforma o
// getStats() numa amostra pequena para o backend. Contadores vão como a diferença desde a leitura anterior; a
// primeira leitura é só a base. Sem o que o app não tem: controlador de degraus, reserva de codec. Puro.

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
  /** Quadros codificados (envio) ou decodificados (recepção); -1 = o WebRTC não conta. */
  frames: number
  /** Recepção: quadros que chegaram. */
  framesReceived: number
  /** Envio: quadros que a captura entregou (media-source). */
  captured: number
  /** ms gastos no codec (totalEncodeTime/totalDecodeTime). */
  codecMs: number
  /** Call: amostras de áudio sintetizadas (sem o silêncio) e recebidas. */
  concealed: number
  samples: number
  /** Envio: soma do QP dos quadros codificados (qpSum); -1 = o WebRTC não conta. */
  qp: number
  /** Call: ms de áudio que a saída sintetizou e ms tocados (media-playout). */
  synth: number
  playout: number
  /** A camada (ssrc) lida: a perda na subida só conta entre leituras da mesma. */
  ssrc: number
}

export interface SampleResult {
  sample: TelemetrySample
  counters: SampleCounters
  /** Nome do codificador/decodificador (encoderImplementation/decoderImplementation); '' sem nome. */
  component: string
}

export const n0 = (value: unknown): number => num(value) ?? 0

/** Os nomes dos contadores no envio e na recepção. */
export interface CounterKeys {
  bytes: string
  keyFrames: string
  frames: string
  codecTime: string
}

const SEND: CounterKeys = { bytes: 'bytesSent', keyFrames: 'keyFramesEncoded', frames: 'framesEncoded', codecTime: 'totalEncodeTime' }
const RECEIVE: CounterKeys = { bytes: 'bytesReceived', keyFrames: 'keyFramesDecoded', frames: 'framesDecoded', codecTime: 'totalDecodeTime' }
export const NO_KEYS: CounterKeys = { bytes: '', keyFrames: '', frames: '', codecTime: '' }

export function countersOf(stat: Stat, keys: CounterKeys, source?: Stat): SampleCounters {
  return {
    timestamp: n0(stat.timestamp),
    bytes: n0(stat[keys.bytes]),
    keyFrames: n0(stat[keys.keyFrames]),
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
    codecMs: n0(stat[keys.codecTime]) * 1000,
    concealed: 0,
    samples: 0,
    qp: num(stat.qpSum) ?? -1,
    synth: 0,
    playout: 0,
    ssrc: n0(stat.ssrc)
  }
}

export type Deltas = Record<keyof SampleCounters, number>

/** Diferenças no intervalo (zeros na primeira leitura; contador que voltou = 0). */
export function deltas(now: SampleCounters, prev: SampleCounters | null): Deltas {
  const out = {} as Deltas
  for (const key of Object.keys(now) as (keyof SampleCounters)[]) {
    out[key] = prev ? Math.max(0, now[key] - prev[key]) : 0
  }
  return out
}

const round1 = (value: number): number => Math.round(value * 10) / 10

/** Por segundo no intervalo (null sem intervalo). */
function perSecond(count: number, d: Deltas): number | null {
  return d.timestamp > 0 ? round1((count * 1000) / d.timestamp) : null
}

/** Quadros/s no intervalo; primeira leitura ou contador ausente/que voltou: o do momento. */
function intervalFps(stat: Stat, now: SampleCounters, prev: SampleCounters | null, d: Deltas): number | null {
  const counted = prev !== null && now.frames >= 0 && now.frames >= prev.frames
  return (counted ? perSecond(d.frames, d) : null) ?? num(stat.framesPerSecond)
}

export function lossPct(d: Deltas): number | null {
  const total = d.lost + d.received
  return total > 0 ? Math.round((d.lost * 10000) / total) / 100 : null
}

export const ms = (seconds: unknown): number | null => {
  const value = num(seconds)
  return value === null ? null : Math.round(value * 1000)
}

function selectedPair(report: StatsReport): Stat | undefined {
  let selected: Stat | undefined
  let nominated: Stat | undefined
  report.forEach((stat) => {
    if (stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string') {
      selected = report.get(stat.selectedCandidatePairId) as Stat | undefined
    }
    if (stat.type === 'candidate-pair' && stat.nominated && stat.state === 'succeeded') nominated = stat
  })
  return selected ?? nominated
}

/** Par ICE escolhido: udp, tcp ou relay (TURN); '' sem dado. */
export function transportOf(report: StatsReport): string {
  const pair = selectedPair(report)
  const local = typeof pair?.localCandidateId === 'string' ? (report.get(pair.localCandidateId) as Stat | undefined) : undefined
  if (local?.candidateType === 'relay') return 'relay'
  return text(local?.protocol) ?? ''
}

export function rttMs(report: StatsReport): number | null {
  return ms(selectedPair(report)?.currentRoundTripTime)
}

interface Reading {
  stat: Stat
  report: StatsReport
  now: SampleCounters
  prev: SampleCounters | null
  d: Deltas
}

function reading(stat: Stat, report: StatsReport, now: SampleCounters, prev: SampleCounters | null): Reading {
  return { stat, report, now, prev, d: deltas(now, prev) }
}

function videoBase({ stat, report, now, prev, d }: Reading): TelemetrySample {
  return {
    ...emptySample(),
    seconds: d.timestamp / 1000,
    codec: codecSubtype(report, stat) ?? '',
    width: num(stat.frameWidth),
    height: num(stat.frameHeight),
    fps: intervalFps(stat, now, prev, d),
    codec_ms: d.frames > 0 ? round1(d.codecMs / d.frames) : null,
    bitrate_kbps: d.timestamp > 0 ? Math.round((d.bytes * 8) / d.timestamp) : null,
    key_frames: d.keyFrames,
    pli: d.pli,
    nack: d.nack,
    transport: transportOf(report),
    rtt_ms: rttMs(report)
  }
}

/** Camadas do simulcast saindo no codec principal. */
function layersOf(report: StatsReport, codec: string): number {
  let layers = 0
  report.forEach((stat) => {
    if (stat.type === 'outbound-rtp' && stat.kind === 'video' && stat.active !== false && codecSubtype(report, stat) === codec) layers++
  })
  return layers
}

/** A media-source (captura) do envio: quadros que a tela entregou ao codificador. */
function mediaSource(report: StatsReport, stat: Stat): Stat | undefined {
  return typeof stat.mediaSourceId === 'string' ? (report.get(stat.mediaSourceId) as Stat | undefined) : undefined
}

function captureFps({ prev, d }: Reading, source: Stat | undefined): number | null {
  if (!source) return null
  return (prev ? perSecond(d.captured, d) : null) ?? num(source.framesPerSecond)
}

/** O que o servidor diz que recebeu do envio principal (o remote-inbound-rtp ligado a ele). */
function remoteOf(report: StatsReport, stat: Stat): Stat | undefined {
  let found: Stat | undefined
  report.forEach((other) => {
    if (other.type === 'remote-inbound-rtp' && other.localId === stat.id) found = other
  })
  return found
}

/** Perdidos e recebidos na subida (ADR 0074); sem packetsReceived, recebidos = mandados − perdidos. */
function uplink(stat: Stat, remote: Stat | undefined): Pick<SampleCounters, 'lost' | 'received'> {
  if (!remote) return { lost: 0, received: 0 }
  const lost = n0(remote.packetsLost)
  return { lost, received: num(remote.packetsReceived) ?? Math.max(0, n0(stat.packetsSent) - lost) }
}

/** QP médio do intervalo; sem qpSum (numa das leituras) ou sem quadro novo: null. */
function qpOf({ now, prev, d }: Reading): number | null {
  const counted = prev !== null && now.qp >= 0 && prev.qp >= 0
  return counted && d.frames > 0 ? round1(d.qp / d.frames) : null
}

/** A leitura anterior é da mesma camada e também tinha o remote-inbound-rtp. */
function sameLayerWithRemote({ now, prev }: Reading): boolean {
  return prev !== null && prev.ssrc === now.ssrc && prev.lost + prev.received > 0
}

/** Os sinais da ADR 0074 no envio: QP, fonte, perda e jitter na subida. */
function shareSignals(read: Reading, source: Stat | undefined, remote: Stat | undefined): Partial<TelemetrySample> {
  return {
    qp: qpOf(read),
    source_width: num(source?.width),
    source_height: num(source?.height),
    loss_pct: sameLayerWithRemote(read) ? lossPct(read.d) : null,
    jitter_ms: ms(remote?.jitter)
  }
}

/** A minha transmissão de tela. */
export function shareSample(input: ScreenStatsInput, prev: SampleCounters | null): SampleResult | null {
  const stat = videoRtp(input.report, 'outbound-rtp', 'bytesSent')
  if (!stat) return null
  const source = mediaSource(input.report, stat)
  const remote = remoteOf(input.report, stat)
  const read = reading(stat, input.report, { ...countersOf(stat, SEND, source), ...uplink(stat, remote) }, prev)
  const base = videoBase(read)
  const component = text(stat.encoderImplementation) ?? ''
  return {
    counters: read.now,
    component,
    sample: {
      ...base,
      ...shareSignals(read, source, remote),
      layers: layersOf(input.report, base.codec),
      hardware: onHardware(component, stat.powerEfficientEncoder),
      capture_fps: captureFps(read, source),
      target_fps: input.requestedFps,
      limitation: text(stat.qualityLimitationReason) ?? ''
    }
  }
}

/** A transmissão de outra pessoa que estou assistindo. */
export function watchSample(input: ScreenStatsInput, prev: SampleCounters | null): SampleResult | null {
  const stat = videoRtp(input.report, 'inbound-rtp', 'bytesReceived')
  if (!stat) return null
  const read = reading(stat, input.report, countersOf(stat, RECEIVE), prev)
  const { d } = read
  const component = text(stat.decoderImplementation) ?? ''
  return {
    counters: read.now,
    component,
    sample: {
      ...videoBase(read),
      hardware: onHardware(component, stat.powerEfficientDecoder),
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
