// Quanto da linha a janela ficou visível e com foco, contado pelos eventos
// (visibilitychange, focus, blur): sem timer nenhum.

export class VisibilityClock {
  private since: number
  private rowStart: number
  private visibleMs = 0
  private focusedMs = 0

  constructor(
    now: number,
    private visible: boolean,
    private focused: boolean
  ) {
    this.since = now
    this.rowStart = now
  }

  set(now: number, visible: boolean, focused: boolean): void {
    this.advance(now)
    this.visible = visible
    this.focused = focused
  }

  /** % da linha visível e com foco (null se a linha não durou nada); abre a próxima. */
  take(now: number): { visiblePct: number | null; focusedPct: number | null } {
    this.advance(now)
    const total = now - this.rowStart
    const pct = (ms: number): number | null => (total > 0 ? Math.round((ms / total) * 100) : null)
    const result = { visiblePct: pct(this.visibleMs), focusedPct: pct(this.focusedMs) }
    this.rowStart = now
    this.visibleMs = 0
    this.focusedMs = 0
    return result
  }

  private advance(now: number): void {
    const elapsed = Math.max(0, now - this.since)
    if (this.visible) this.visibleMs += elapsed
    if (this.focused) this.focusedMs += elapsed
    this.since = now
  }
}
