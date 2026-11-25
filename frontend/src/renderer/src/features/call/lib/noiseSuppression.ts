// Microfone com supressão de ruído RNNoise (xiph/rnnoise compilado para WASM,
// via @sapphi-red/web-noise-suppressor). Cada microfone aberto tem o próprio
// AudioContext — abrir o teste de microfone não mexe no da chamada.
//
//   mic ─┬─ RNNoise ─ wetGain ─┐
//        └────────── dryGain ──┴─ entrada ─┬─ voice mod ─┬─ detecção/portão ─ destino (track enviada)
//                                          │             └─ monitor (mudo, "Ouvir minha voz")
//                                          └─ analisador (medidor, mudo)
//
// O RNNoise só existe com a supressão ligada e o voice mod só com uma voz
// ativa: fora disso saem do grafo e o sinal passa direto (audioStageSwitch.ts).
// Ligar/desligar no meio da chamada cruza os ganhos em 15 ms: a track de saída
// é sempre a mesma, então muda ao vivo sem republicar nada no LiveKit. O
// volume de entrada e a sensibilidade também mudam ao vivo.
//
// A detecção de fala do próprio usuário (voiceActivityWorklet) roda neste
// mesmo contexto, depois do ganho de entrada: é o portão e o anel verde. Assim
// a sensibilidade e o medidor veem o mesmo sinal que vai para a chamada.

import { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor'
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
// Inline (data URL): o app empacotado roda em file://, onde fetch não funciona.
import rnnoiseWasmDataUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?inline'
import { decodeDataUrl } from './dataUrl'
import voiceActivityWorkletUrl from './voiceActivityWorklet.ts?worker&url'
import {
  rmsDb,
  VOICE_ACTIVITY_PROCESSOR,
  voiceActivityFor,
  type VoiceActivitySettings
} from './voiceActivity'
import { useNoiseSuppressionStore } from '../store/noiseSuppressionStore'
import { useRnnoiseStatusStore } from '../store/rnnoiseStatusStore'
import { useVoiceAudioStore, type VoiceAudioSettings } from '../store/voiceAudioStore'
import { switchStage, type AudioStage } from './audioStageSwitch'
import { loadVoiceMod, voiceModPath, type VoiceModNode, type VoiceModPath } from './voiceMod'
import type { VoiceModSettings } from './voiceModPresets'
import { useVoiceModStore } from '../store/voiceModStore'
import { forgetMicDsp, watchMicDsp } from './micDspStats'

/** O RNNoise trabalha em quadros de 10 ms a 48 kHz. */
const SAMPLE_RATE = 48_000
/** Constante de tempo do crossfade ao mexer nos volumes e no monitor. */
const FADE_SECONDS = 0.015
/**
 * Espera do RNNoise recém-criado antes do crossfade: o WASM instancia na
 * thread de áudio e o anel de 1920 amostras enche. No Electron 44 o primeiro
 * som sai em 17–26 ms; 100 ms dá folga para máquinas mais lentas.
 */
const RNNOISE_WARMUP_SECONDS = 0.1
/** Janela do medidor de nível (~21 ms a 48 kHz). */
const METER_FFT_SIZE = 1024

export type MicVoiceSettings = Pick<
  VoiceAudioSettings,
  'inputVolume' | 'detectionEnabled' | 'sensitivity'
>

export interface MicHandle {
  /** Stream que vai para a chamada / teste (já processado). */
  stream: MediaStream
  setNoiseSuppression: (on: boolean) => void
  /** Volume de entrada e detecção de voz ao vivo (só com o processamento completo). */
  setVoiceAudio?: (settings: MicVoiceSettings) => void
  /** Voice mod ao vivo (só quando o worklet do voice mod carregou). */
  setVoiceMod?: (settings: VoiceModSettings) => void
  /** Liga/desliga ouvir a própria voz já alterada (para testar o voice mod). */
  setMonitor?: (on: boolean) => void
  /** Nível do microfone em dBFS, antes do portão (para o medidor de sensibilidade). */
  readLevel?: () => number
  /**
   * Detecção de fala no próprio contexto do microfone (só com o RNNoise e o
   * worklet de detecção). Antes do `track.enabled`: quem chama aplica o mudo.
   */
  watchSpeaking?: (onChange: (speaking: boolean) => void) => SpeakingTap
  /** Para o microfone de verdade, o RNNoise e o AudioContext. */
  stop: () => void
}

export interface SpeakingTap {
  /** Resolve quando a detecção está rodando; rejeita se o worklet não carregou. */
  ready: Promise<void>
  stop: () => void
}

let wasmBinary: ArrayBuffer | null = null

function rnnoiseWasm(): ArrayBuffer {
  wasmBinary ??= decodeDataUrl(rnnoiseWasmDataUrl)
  // O worklet recebe uma cópia (structured clone) — o cache continua inteiro.
  return wasmBinary
}

function captureMic(deviceId: string, browserSuppression: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: true,
      autoGainControl: true,
      // Com o RNNoise a do Chromium fica desligada (as duas juntas abafam a voz).
      noiseSuppression: browserSuppression,
      channelCount: 1
    },
    video: false
  })
}

const active = new Set<MicHandle>()

/** Um RNNoise novo (estado limpo); `null` se não instanciar. */
function rnnoiseStage(ctx: AudioContext): AudioStage | null {
  try {
    const node = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: rnnoiseWasm() })
    // Microfone estéreo vira mono antes do RNNoise (nenhum canal passa cru).
    node.channelCount = 1
    node.channelCountMode = 'explicit'
    return {
      input: node,
      output: node,
      // O processador passa a devolver false e o Chromium para de chamá-lo.
      destroy: () => node.destroy()
    }
  } catch (err) {
    console.error('[RNNoise] não instanciou — seguindo sem a supressão:', err)
    return null
  }
}

/** Sem o voice mod o microfone segue: só não há mudança de voz. */
async function loadVoiceModOrNull(ctx: AudioContext): Promise<(() => VoiceModNode) | null> {
  try {
    return await loadVoiceMod(ctx)
  } catch (err) {
    console.error('[voz] voice mod indisponível:', err)
    return null
  }
}

// O toggle vale na hora para todo microfone aberto (chamada e teste).
useNoiseSuppressionStore.subscribe((state, prev) => {
  if (state.enabled === prev.enabled) return
  active.forEach((mic) => mic.setNoiseSuppression(state.enabled))
})

useVoiceAudioStore.subscribe((state, prev) => {
  if (
    state.inputVolume === prev.inputVolume &&
    state.detectionEnabled === prev.detectionEnabled &&
    state.sensitivity === prev.sensitivity
  ) {
    return
  }
  active.forEach((mic) => mic.setVoiceAudio?.(state))
})

useVoiceModStore.subscribe((state, prev) => {
  if (state.monitoring !== prev.monitoring) {
    active.forEach((mic) => mic.setMonitor?.(state.monitoring))
  }
  if (
    state.preset !== prev.preset ||
    state.pitch !== prev.pitch ||
    state.timbre !== prev.timbre ||
    state.intensity !== prev.intensity
  ) {
    active.forEach((mic) => mic.setVoiceMod?.(state))
  }
})

/**
 * Abre o microfone com o RNNoise no caminho. Se o RNNoise não carregar, libera
 * tudo o que abriu e devolve o microfone cru, com a supressão padrão do
 * Chromium se a do usuário estiver ligada — nunca pior do que sem o RNNoise.
 */
export async function openMicrophone(deviceId = ''): Promise<MicHandle> {
  const raw = await captureMic(deviceId, false)
  let ctx: AudioContext | null = null
  try {
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
    // O módulo e o WASM ficam prontos já na abertura: ligar a supressão depois
    // só instancia o nó (sem esperar rede nem decodificação).
    await ctx.audioWorklet.addModule(rnnoiseWorkletUrl)
    rnnoiseWasm()

    // Sem o worklet de detecção o microfone segue: só não há portão nem detecção.
    let vad: AudioWorkletNode | null = null
    try {
      await ctx.audioWorklet.addModule(voiceActivityWorkletUrl)
      vad = new AudioWorkletNode(ctx, VOICE_ACTIVITY_PROCESSOR, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1]
      })
    } catch (err) {
      console.error('[fala] detecção do microfone indisponível:', err)
    }

    const context = ctx
    watchMicDsp(context)
    const source = ctx.createMediaStreamSource(raw)
    const wet = ctx.createGain()
    wet.gain.value = 0
    const dry = ctx.createGain()
    const inputGain = ctx.createGain()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = METER_FFT_SIZE
    // O analisador só é processado se estiver ligado ao destino; por isso passa mudo.
    const silent = ctx.createGain()
    silent.gain.value = 0
    const destination = ctx.createMediaStreamDestination()
    const createMod = await loadVoiceModOrNull(ctx)
    useVoiceModStore.getState().setAvailable(createMod !== null)
    source.connect(dry).connect(inputGain)
    wet.connect(inputGain)
    const rnnoise = switchStage({
      ctx,
      source,
      direct: dry,
      through: wet,
      create: () => rnnoiseStage(context),
      warmupSeconds: RNNOISE_WARMUP_SECONDS
    })
    const mod: VoiceModPath | null = createMod
      ? voiceModPath(ctx, inputGain, createMod, useVoiceModStore.getState())
      : null
    // Cauda da cadeia: depois do voice mod (se carregou), alimenta detecção e monitor.
    const tail: AudioNode = mod ? mod.output : inputGain
    if (vad) tail.connect(vad).connect(destination)
    else tail.connect(destination)
    inputGain.connect(analyser).connect(silent).connect(destination)
    // Monitor: ouvir a própria voz já alterada. Mudo até o usuário pedir.
    const monitor = ctx.createGain()
    monitor.gain.value = 0
    tail.connect(monitor).connect(ctx.destination)
    if (ctx.state === 'suspended') await ctx.resume()

    const listeners = new Set<(speaking: boolean) => void>()
    if (vad) {
      vad.port.onmessage = (event: MessageEvent<boolean>) => {
        listeners.forEach((listener) => listener(event.data))
      }
    }

    const applyVoice = (settings: MicVoiceSettings, instant: boolean): void => {
      const t = context.currentTime
      inputGain.gain.cancelScheduledValues(t)
      if (instant) inputGain.gain.setValueAtTime(settings.inputVolume, t)
      else inputGain.gain.setTargetAtTime(settings.inputVolume, t, FADE_SECONDS)
      const message: VoiceActivitySettings = {
        config: voiceActivityFor(settings.sensitivity),
        gate: settings.detectionEnabled
      }
      vad?.port.postMessage(message)
    }
    rnnoise.set(useNoiseSuppressionStore.getState().enabled)
    applyVoice(useVoiceAudioStore.getState(), true)
    if (useVoiceModStore.getState().monitoring) monitor.gain.value = 1
    useRnnoiseStatusStore.getState().setAvailable(true)

    const levels = new Float32Array(analyser.fftSize)
    let stopped = false
    const handle: MicHandle = {
      stream: destination.stream,
      setNoiseSuppression: (on) => {
        if (!stopped) rnnoise.set(on)
      },
      setVoiceAudio: (settings) => {
        if (!stopped) applyVoice(settings, false)
      },
      setVoiceMod: mod
        ? (settings) => {
            if (!stopped) mod.apply(settings)
          }
        : undefined,
      setMonitor: (on) => {
        if (!stopped) monitor.gain.setTargetAtTime(on ? 1 : 0, context.currentTime, FADE_SECONDS)
      },
      readLevel: () => {
        analyser.getFloatTimeDomainData(levels)
        let sum = 0
        for (const v of levels) sum += v * v
        return rmsDb(sum, levels.length)
      },
      watchSpeaking: vad
        ? (onChange) => {
            listeners.add(onChange)
            return {
              ready: Promise.resolve(),
              stop: () => {
                listeners.delete(onChange)
              }
            }
          }
        : undefined,
      stop: () => {
        if (stopped) return
        stopped = true
        active.delete(handle)
        listeners.clear()
        mod?.destroy()
        if (active.size === 0) useVoiceModStore.getState().setMonitoring(false)
        raw.getTracks().forEach((t) => t.stop())
        destination.stream.getTracks().forEach((t) => t.stop())
        rnnoise.destroy()
        forgetMicDsp(context)
        void context.close()
      }
    }
    active.add(handle)
    return handle
  } catch (err) {
    console.error('[RNNoise] não carregou — usando a supressão do Chromium:', err)
    if (ctx) forgetMicDsp(ctx)
    void ctx?.close()
    raw.getTracks().forEach((t) => t.stop())
    useRnnoiseStatusStore.getState().setAvailable(false)
    useVoiceModStore.getState().setAvailable(false)
    // A do Chromium só substitui o RNNoise ligado: desligada é sem supressão nenhuma.
    const fallback = await captureMic(deviceId, useNoiseSuppressionStore.getState().enabled)
    return {
      stream: fallback,
      setNoiseSuppression: () => {},
      stop: () => fallback.getTracks().forEach((t) => t.stop())
    }
  }
}
