import { useNoiseSuppressionStore } from '../store/noiseSuppressionStore'
import { useRnnoiseStatusStore } from '../store/rnnoiseStatusStore'
import { useVoiceAudioStore } from '../store/voiceAudioStore'
import { useVoiceModStore } from '../store/voiceModStore'

// O processamento do microfone engasga no PC de quem fala? (telemetria,
// docs/adr/0074): o AudioContext do microfone (RNNoise, modificador, portão)
// se registra aqui ao abrir; a telemetria da voz lê quanto do tempo ele não
// entregou o áudio a tempo (AudioContext.playbackStats; o nome antigo era
// playoutStats) e o que estava ligado. Sem leitura de getStats().

interface PlaybackStatsLike {
  underrunDuration?: number
  totalDuration?: number
  fallbackFramesDuration?: number
  totalFramesDuration?: number
}

type ContextWithStats = AudioContext & {
  playbackStats?: PlaybackStatsLike
  playoutStats?: PlaybackStatsLike
}

export interface DspState {
  rnnoise: boolean
  preset: string
  gate: boolean
}

/** Segundos acumulados (null = o navegador não conta) e o que estava ligado. */
export interface DspReading {
  underrun: number | null
  total: number | null
  dsp: string
}

const contexts = new Set<ContextWithStats>()

export function watchMicDsp(ctx: AudioContext): void {
  contexts.add(ctx)
}

export function forgetMicDsp(ctx: AudioContext): void {
  contexts.delete(ctx)
}

/** "rnnoise · voz:robo · portão" ("nenhum" com tudo desligado). */
export function describeDsp(state: DspState): string {
  const parts = [
    state.rnnoise ? 'rnnoise' : '',
    state.preset && state.preset !== 'normal' ? `voz:${state.preset}` : '',
    state.gate ? 'portão' : ''
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'nenhum'
}

function statsOf(ctx: ContextWithStats): { underrun: number; total: number } | null {
  const stats = ctx.playbackStats ?? ctx.playoutStats
  const underrun = stats?.underrunDuration ?? stats?.fallbackFramesDuration
  const total = stats?.totalDuration ?? stats?.totalFramesDuration
  return typeof underrun === 'number' && typeof total === 'number' ? { underrun, total } : null
}

/** null sem microfone aberto. */
export function readMicDsp(state: DspState = currentDspState()): DspReading | null {
  if (contexts.size === 0) return null
  const all = [...contexts].flatMap((ctx) => statsOf(ctx) ?? [])
  const sum = (key: 'underrun' | 'total'): number | null =>
    all.length > 0 ? all.reduce((acc, s) => acc + s[key], 0) : null
  return { underrun: sum('underrun'), total: sum('total'), dsp: describeDsp(state) }
}

/** O que está ligado agora (o RNNoise só conta se carregou). */
export function currentDspState(): DspState {
  return {
    rnnoise:
      useNoiseSuppressionStore.getState().enabled && useRnnoiseStatusStore.getState().available,
    preset: useVoiceModStore.getState().preset,
    gate: useVoiceAudioStore.getState().detectionEnabled
  }
}
