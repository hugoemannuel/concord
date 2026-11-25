import { ApiTimings } from './apiTimings'
import type { RendererMeasures } from './deviceTypes'
import { InteractionStats } from './interactionStats'
import { LongFrameStats } from './longFrameStats'
import { LoopLag } from './loopLag'
import { VisibilityClock } from './visibilityClock'

// Tudo o que o renderer mede para uma linha do aparelho (docs/adr/0069). Os
// observadores (PerformanceObserver) e os eventos da janela chegam de fora.

const MB = 1024 * 1024

interface MeterEnv {
  now(): number
  visible(): boolean
  focused(): boolean
  apiBaseUrl: string
  takeWsRtt(): { medianMs: number | null; maxMs: number | null }
}

interface ResourceLike {
  name: string
  duration: number
  initiatorType: string
}

export class RendererMeter {
  private readonly lag: LoopLag
  private readonly frames = new LongFrameStats()
  private readonly inputs = new InteractionStats()
  private readonly clock: VisibilityClock
  private readonly api: ApiTimings

  constructor(private readonly env: MeterEnv) {
    this.lag = new LoopLag(env)
    this.clock = new VisibilityClock(env.now(), env.visible(), env.focused())
    this.api = new ApiTimings(env.apiBaseUrl)
  }

  start(): void {
    this.lag.sync()
  }

  stop(): void {
    this.lag.stop()
  }

  longFrame(durationMs: number): void {
    this.frames.add(durationMs, this.env.visible())
  }

  interaction(interactionId: number, durationMs: number): void {
    this.inputs.add(interactionId, durationMs)
  }

  resource(entry: ResourceLike): void {
    this.api.add(entry)
  }

  /** visibilitychange, focus ou blur. */
  windowChanged(): void {
    this.clock.set(this.env.now(), this.env.visible(), this.env.focused())
    this.lag.sync()
  }

  /** Fecha a linha: `heapBytes` é o performance.memory.usedJSHeapSize de agora. */
  take(heapBytes: number | null): RendererMeasures {
    const { visiblePct, focusedPct } = this.clock.take(this.env.now())
    const lag = this.lag.take()
    const frames = this.frames.take()
    const inputs = this.inputs.take()
    const ws = this.env.takeWsRtt()
    const api = this.api.take()
    return {
      visible_pct: visiblePct,
      focused_pct: focusedPct,
      lag_p95_ms: lag.p95Ms,
      lag_max_ms: lag.maxMs,
      long_count: frames.count,
      long_ms: frames.ms,
      long_max_ms: frames.maxMs,
      slow_inputs: inputs.slow,
      input_max_ms: inputs.maxMs,
      heap_mb: heapBytes === null ? null : Math.round(heapBytes / MB),
      ws_rtt_ms: ws.medianMs,
      ws_rtt_max_ms: ws.maxMs,
      api_ms_p50: api.p50Ms,
      api_ms_p95: api.p95Ms,
      api_count: api.count
    }
  }
}
