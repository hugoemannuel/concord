import { percentile } from '../../../../shared/lib/perf/percentile'

// Atraso do laço de eventos do renderer (docs/adr/0069): um timer de 2 s que
// só roda com a janela visível (escondida, o Chromium espaça os timers e o
// atraso não diz nada). Atraso = quando disparou − quando devia disparar.
// Acima de 30 s não é travada: é o aparelho que dormiu (suspensão, hibernação).

export const LAG_TICK_MS = 2000
/** 5 min de voltas de 2 s: o teto só protege de uma linha que não fechou. */
const MAX_SAMPLES = 150
/** Acima disto o timer não atrasou: o aparelho estava suspenso. */
const SUSPEND_MS = 30_000

interface LagEnv {
  now(): number
  visible(): boolean
}

export class LoopLag {
  private delays: number[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private expected = 0

  constructor(private readonly env: LagEnv) {}

  /** Liga com a janela visível, desliga escondida. Chamar no início e a cada mudança da janela. */
  sync(): void {
    if (this.env.visible()) {
      if (this.timer === null) this.schedule()
    } else {
      this.stop()
    }
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  /** p95 e máximo desde a última take (null se não mediu nenhuma volta), e zera. */
  take(): { p95Ms: number | null; maxMs: number | null } {
    const taken = this.delays
    this.delays = []
    return { p95Ms: percentile(taken, 95), maxMs: taken.length > 0 ? Math.max(...taken) : null }
  }

  private schedule(): void {
    this.expected = this.env.now() + LAG_TICK_MS
    this.timer = setTimeout(() => this.fire(), LAG_TICK_MS)
  }

  private fire(): void {
    this.timer = null
    if (!this.env.visible()) return
    const delay = Math.max(0, Math.round(this.env.now() - this.expected))
    if (delay <= SUSPEND_MS) this.record(delay)
    this.schedule()
  }

  private record(delay: number): void {
    this.delays.push(delay)
    if (this.delays.length > MAX_SAMPLES) this.delays.shift()
  }
}
