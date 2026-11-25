import type { DeviceSample } from './deviceTypes'

// Lote das linhas fechadas: sai com 5 linhas, quando a mais velha tem 5 min
// ou ao sair de call/live. Até 10 por pedido e no mínimo 100 s entre pedidos
// (o servidor aceita 3 a cada 5 min por pessoa).

export const BATCH_ROWS = 5
export const BATCH_AGE_MS = 5 * 60_000
export const MAX_PER_REQUEST = 10
export const MIN_SEND_GAP_MS = 100_000
const MAX_QUEUED = 20
const MAX_AGO_S = 3600

export interface ClosedRow {
  closedAt: number
  sample: Omit<DeviceSample, 'ago_s'>
}

export class DeviceBatchQueue {
  private rows: ClosedRow[] = []
  private leftCall = false
  private lastSent = -Infinity

  push(row: ClosedRow): void {
    this.rows.push(row)
    if (this.rows.length > MAX_QUEUED) this.rows.shift()
  }

  /** Saiu de call/live: o lote vai logo (respeitando o intervalo entre pedidos). */
  noteLeftCall(): void {
    this.leftCall = true
  }

  size(): number {
    return this.rows.length
  }

  due(now: number): boolean {
    const oldest = this.rows[0]
    if (!oldest || now - this.lastSent < MIN_SEND_GAP_MS) return false
    return this.rows.length >= BATCH_ROWS || now - oldest.closedAt >= BATCH_AGE_MS || this.leftCall
  }

  /** As próximas (até 10) com ago_s calculado agora; linha de mais de 1 h é descartada. */
  drain(now: number): DeviceSample[] {
    const taken = this.rows.splice(0, MAX_PER_REQUEST)
    this.lastSent = now
    this.leftCall = false
    return taken
      .map(({ closedAt, sample }) => ({ ...sample, ago_s: Math.round((now - closedAt) / 1000) }))
      .filter((sample) => sample.ago_s <= MAX_AGO_S)
  }

  clear(): void {
    this.rows = []
    this.leftCall = false
  }
}
