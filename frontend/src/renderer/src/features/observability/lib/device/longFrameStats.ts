// Quadros longos (Long Animation Frames, ou longtask onde não houver): só com
// a janela visível, porque escondida não há quadro para a pessoa ver travar.

export class LongFrameStats {
  private count = 0
  private totalMs = 0
  private maxMs = 0

  add(durationMs: number, visible: boolean): void {
    if (!visible) return
    this.count += 1
    this.totalMs += durationMs
    this.maxMs = Math.max(this.maxMs, durationMs)
  }

  /** Quantos, ms somados e o maior desde a última take, e zera. */
  take(): { count: number; ms: number; maxMs: number | null } {
    const result = {
      count: this.count,
      ms: Math.round(this.totalMs),
      maxMs: this.count > 0 ? Math.round(this.maxMs) : null
    }
    this.count = 0
    this.totalMs = 0
    this.maxMs = 0
    return result
  }
}
