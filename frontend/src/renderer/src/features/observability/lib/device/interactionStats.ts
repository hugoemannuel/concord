// Interações lentas (Event Timing): um clique gera vários eventos (pointerdown,
// pointerup, click) com o mesmo interactionId; a interação vale a maior duração.

/** Corte de "lenta" (o "precisa melhorar" do INP). */
export const SLOW_INPUT_MS = 200

export class InteractionStats {
  private byId = new Map<number, number>()

  add(interactionId: number, durationMs: number): void {
    if (!(interactionId > 0)) return
    this.byId.set(interactionId, Math.max(this.byId.get(interactionId) ?? 0, durationMs))
  }

  /** Quantas lentas e a pior desde a última take, e zera. */
  take(): { slow: number; maxMs: number | null } {
    const durations = [...this.byId.values()]
    this.byId = new Map()
    return {
      slow: durations.filter((ms) => ms >= SLOW_INPUT_MS).length,
      maxMs: durations.length > 0 ? Math.round(Math.max(...durations)) : null
    }
  }
}
