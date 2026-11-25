import type { NativeLiveEvent, NativeLiveStart } from '../../../../../shared/nativeLive'
import type { ScreenAdaptView } from '../store/screenAdaptStore'
import type { NativeScreen } from './livekit'
import { nativeQuality, nativeStatsReport, stampNativeStats } from './nativeLiveChoice'
import { ScreenAdapt } from './screenAdapt'
import { encoderInfoFromReport, type ScreenEncoderInfo } from './screenEncoderInfo'
import type { ScreenShareQuality } from './screenShareQuality'
import type { ScreenStatsInput } from './screenStats'
import { describeNativeChoice, noteScreenCodecChoice } from './screenCodecChoice'
import { failureName, noteLiveFailure, noteLiveStart } from './screenStartTelemetry'
import type { Stat } from './screenStatsFormat'

// Uma live pelo motor nativo, vista do renderer: pede o token do participante
// "tela", manda o helper começar e liga o mesmo controlador de degraus da live
// do Chromium (ScreenAdapt) às estatísticas que o helper manda. Ver ADR 0031.

/** O que o renderer usa de window.api.nativeLive. */
export interface NativeLiveBridge {
  start(start: NativeLiveStart): Promise<boolean>
  setQuality(quality: NativeLiveStart['quality']): void
  stop(): void
  onEvent(cb: (event: NativeLiveEvent) => void): () => void
}

export interface NativeLiveDeps {
  bridge: NativeLiveBridge
  /** Endereço do LiveKit (o mesmo da call). */
  url: string
  /** Token e identidade do participante "tela" (rota do backend). */
  token(): Promise<{ token: string; identity: string }>
  /** Camada extra de 720p. */
  simulcast: boolean
  onView(view: ScreenAdaptView | null): void
  /** A live acabou depois de começar; `failed` = não foi a pessoa (cai para o Chromium). */
  onEnded(failed: boolean): void
}

export type NativeStartResult = 'started' | 'cancelled' | 'failed'

/** Fins que não são falha: pararam a live (app ou sistema). */
const CLEAN_ENDS = new Set(['stopped', 'capture_ended'])

type Phase = 'idle' | 'starting' | 'live' | 'done'

export class NativeLiveSession implements NativeScreen {
  identity = ''
  private phase: Phase = 'idle'
  private stats: Record<string, unknown>[] = []
  private source: { width: number; height: number } | null = null
  private adapt: ScreenAdapt | null = null
  private view: ScreenAdaptView | null = null
  private startError: NativeStartResult | null = null
  /** Telemetria (ADR 0074): quando a captura começou, por que não começou e se o motor já foi anotado. */
  private capturedAt: number | null = null
  private failure: unknown = null
  private choiceNoted = false
  private settle: (result: NativeStartResult) => void = () => {}
  private unsubscribe: () => void = () => {}

  constructor(
    private readonly deps: NativeLiveDeps,
    private chosen: ScreenShareQuality
  ) {}

  /** Abre o seletor do sistema e publica; resolve quando já está no ar (ou não deu). */
  async start(): Promise<NativeStartResult> {
    if (this.phase !== 'idle') return 'failed'
    this.phase = 'starting'
    const result = new Promise<NativeStartResult>((resolve) => (this.settle = resolve))
    this.unsubscribe = this.deps.bridge.onEvent((event) => this.handle(event))
    try {
      const { token, identity } = await this.deps.token()
      this.identity = identity
      const started = await this.deps.bridge.start({
        url: this.deps.url,
        token,
        quality: nativeQuality(this.chosen),
        simulcast: this.deps.simulcast,
        audio: false
      })
      if (!started) this.finishStart('failed')
    } catch (err) {
      this.failure = err
      this.finishStart('failed')
    }
    return result
  }

  /** A pessoa escolheu outro degrau. */
  setQuality(quality: ScreenShareQuality): void {
    this.chosen = quality
    this.deps.bridge.setQuality(nativeQuality(quality, this.source ?? {}))
    this.adapt?.choose(quality)
  }

  stop(): void {
    if (this.phase === 'done' || this.phase === 'idle') return
    this.deps.bridge.stop()
    if (this.phase === 'starting') this.finishStart('cancelled')
    else this.cleanup()
  }

  get live(): boolean {
    return this.phase === 'live'
  }

  statsInput(): ScreenStatsInput | null {
    if (this.phase !== 'live') return null
    return {
      local: true,
      report: nativeStatsReport(this.stats),
      enabled: true,
      streamState: 'active',
      requestedFps: this.chosen.frameRate,
      quality: this.view,
      source: {
        width: this.source?.width ?? null,
        height: this.source?.height ?? null,
        surface: null
      }
    }
  }

  encoderInfo(): ScreenEncoderInfo | null {
    if (this.phase !== 'live') return null
    return encoderInfoFromReport(
      nativeStatsReport(this.stats),
      this.view?.effective ?? null,
      'h264'
    )
  }

  private handle(event: NativeLiveEvent): void {
    if (event.event === 'capturing') this.onCapturing(event.width, event.height)
    else if (event.event === 'stats') this.onStats(event.stats)
    else if (event.event === 'published') this.onPublished()
    else if (event.event === 'error' && this.phase === 'starting') this.onStartError(event.code)
    else if (event.event === 'ended') this.onEnded(event.reason)
  }

  private onCapturing(width: number, height: number): void {
    this.source = { width, height }
    this.capturedAt = performance.now()
  }

  private onStartError(code: string): void {
    this.startError = code === 'capture_denied' ? 'cancelled' : 'failed'
    this.failure = code
  }

  /** As estatísticas do helper; a primeira depois de publicar diz onde o H.264 saiu. */
  private onStats(stats: Record<string, unknown>[]): void {
    this.stats = stampNativeStats(stats, Date.now())
    if (this.phase !== 'live' || this.choiceNoted) return
    const out = this.stats.find((s) => s.type === 'outbound-rtp' && s.kind === 'video') as
      Stat | undefined
    if (!out) return
    const efficient = out.powerEfficientEncoder
    noteScreenCodecChoice(describeNativeChoice(typeof efficient === 'boolean' ? efficient : null))
    this.choiceNoted = true
  }

  private onPublished(): void {
    if (this.phase !== 'starting') return
    this.phase = 'live'
    if (this.capturedAt !== null) noteLiveStart(performance.now() - this.capturedAt)
    this.watchQuality()
    this.settle('started')
  }

  private onEnded(reason: string): void {
    if (this.phase === 'starting') {
      this.finishStart(this.startError ?? 'failed')
      return
    }
    if (this.phase !== 'live') return
    this.cleanup()
    this.deps.onEnded(!CLEAN_ENDS.has(reason))
  }

  private finishStart(result: NativeStartResult): void {
    if (this.phase !== 'starting') return
    if (result === 'failed') {
      noteLiveFailure('nativo', failureName(this.failure))
      this.deps.bridge.stop()
    }
    this.cleanup()
    this.settle(result)
  }

  /** O controlador de degraus da live do Chromium, lendo as estatísticas do helper. */
  private watchQuality(): void {
    const source = this.source ?? {}
    this.adapt = new ScreenAdapt(
      {
        read: async () => (this.stats.length ? nativeStatsReport(this.stats) : null),
        apply: async (step) => this.deps.bridge.setQuality(nativeQuality(step, source)),
        report: (view) => {
          this.view = view
          this.deps.onView(view)
        },
        // O helper só usa H.264 (placa ou processador): nada a marcar para as próximas lives.
        softwareCodec: () => {}
      },
      this.chosen,
      source,
      this.deps.simulcast
    )
    this.adapt.start()
  }

  private cleanup(): void {
    this.phase = 'done'
    this.unsubscribe()
    this.adapt?.stop()
    this.adapt = null
    this.view = null
    this.deps.onView(null)
  }
}
