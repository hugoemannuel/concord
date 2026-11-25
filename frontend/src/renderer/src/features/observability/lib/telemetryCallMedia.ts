import { num, text, type Stat } from '../../call/lib/screenStatsFormat'
import type { DspReading } from '../../call/lib/micDspStats'
import { n0 } from './telemetrySample'
import type { MediaSignals } from './telemetryTypes'

// O resto da amostra da voz (docs/adr/0074): a saída de áudio do PC
// (media-playout), o processamento do microfone (playbackStats do
// AudioContext dele) e a câmera (a minha enviada e as que recebo). As
// diferenças contam desde a leitura anterior, como o resto da amostra. Puro.

export interface CallMediaCounters {
  /** Segundos sintetizados e tocados pela saída de áudio. */
  playout: { synth: number; total: number } | null
  /** Segundos com o microfone atrasado e tocados. */
  dsp: { underrun: number; total: number } | null
  /** A camada de cima da minha câmera: quadros codificados e a hora. */
  camSent: { id: string; frames: number; timestamp: number } | null
  /** Congelamentos de cada câmera recebida, pelo id da faixa. */
  camRecv: Record<string, number>
}

type CallMedia = Pick<
  MediaSignals,
  | 'dsp_underrun_pct'
  | 'dsp'
  | 'playout_synth_pct'
  | 'cam_fps'
  | 'cam_height'
  | 'cam_limitation'
  | 'cam_freezes'
>

const round1 = (v: number): number => Math.round(v * 10) / 10

function playoutOf(report: RTCStatsReport): CallMediaCounters['playout'] {
  let found: CallMediaCounters['playout'] = null
  report.forEach((stat: Stat) => {
    if (stat.type !== 'media-playout') return
    const prev = found ?? { synth: 0, total: 0 }
    found = {
      synth: prev.synth + n0(stat.synthesizedSamplesDuration),
      total: prev.total + n0(stat.totalSamplesDuration)
    }
  })
  return found
}

/** A camada de cima da minha câmera saindo (a maior altura ativa). */
function cameraOut(report: RTCStatsReport): Stat | null {
  let best: Stat | null = null
  report.forEach((stat: Stat) => {
    if (stat.type !== 'outbound-rtp' || stat.kind !== 'video' || stat.active === false) return
    if (!best || n0(stat.frameHeight) > n0(best.frameHeight)) best = stat
  })
  return best
}

function camerasIn(report: RTCStatsReport): Record<string, number> {
  const out: Record<string, number> = {}
  report.forEach((stat: Stat) => {
    if (stat.type === 'inbound-rtp' && stat.kind === 'video')
      out[String(stat.id)] = n0(stat.freezeCount)
  })
  return out
}

export function callMediaCounters(
  report: RTCStatsReport,
  dsp: DspReading | null
): CallMediaCounters {
  const cam = cameraOut(report)
  const hasDsp = dsp?.underrun != null && dsp.total != null
  return {
    playout: playoutOf(report),
    dsp: hasDsp ? { underrun: dsp.underrun as number, total: dsp.total as number } : null,
    camSent: cam
      ? { id: String(cam.id), frames: n0(cam.framesEncoded), timestamp: n0(cam.timestamp) }
      : null,
    camRecv: camerasIn(report)
  }
}

/** % de `part` no intervalo de `whole` (null sem as duas leituras ou sem tempo). */
function intervalPct(
  now: { part: number; whole: number } | null,
  prev: { part: number; whole: number } | null
): number | null {
  if (!now || !prev) return null
  const whole = now.whole - prev.whole
  return whole > 0 ? round1((Math.max(0, now.part - prev.part) * 100) / whole) : null
}

function cameraFps(
  now: CallMediaCounters,
  prev: CallMediaCounters | null,
  cam: Stat | null
): number | null {
  const a = now.camSent
  const b = prev?.camSent
  if (a && b && a.id === b.id && a.timestamp > b.timestamp && a.frames >= b.frames) {
    return round1(((a.frames - b.frames) * 1000) / (a.timestamp - b.timestamp))
  }
  return num(cam?.framesPerSecond)
}

/** Congelamentos das câmeras presentes nas duas leituras (null sem nenhuma). */
function cameraFreezes(now: CallMediaCounters, prev: CallMediaCounters | null): number | null {
  const both = Object.keys(now.camRecv).filter((id) => prev?.camRecv[id] !== undefined)
  if (both.length === 0) return null
  return both.reduce((sum, id) => sum + Math.max(0, now.camRecv[id] - (prev?.camRecv[id] ?? 0)), 0)
}

const asPart = (
  v: { synth: number; total: number } | { underrun: number; total: number } | null | undefined
): { part: number; whole: number } | null =>
  v ? { part: 'synth' in v ? v.synth : v.underrun, whole: v.total } : null

export function callMediaSignals(
  report: RTCStatsReport,
  now: CallMediaCounters,
  prev: CallMediaCounters | null,
  dsp: DspReading | null
): CallMedia {
  const cam = cameraOut(report)
  return {
    dsp_underrun_pct: intervalPct(asPart(now.dsp), asPart(prev?.dsp)),
    dsp: dsp?.dsp ?? null,
    playout_synth_pct: intervalPct(asPart(now.playout), asPart(prev?.playout)),
    cam_fps: cam ? cameraFps(now, prev, cam) : null,
    cam_height: num(cam?.frameHeight),
    cam_limitation: text(cam?.qualityLimitationReason) ?? null,
    cam_freezes: cameraFreezes(now, prev)
  }
}
