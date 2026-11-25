import type { WorstRow } from '../api/observability'

/** As piores sessões separadas: voz das calls (kind "call") e lives (o resto). */
export function splitWorst(rows: WorstRow[]): { lives: WorstRow[]; calls: WorstRow[] } {
  return {
    lives: rows.filter((r) => r.kind !== 'call'),
    calls: rows.filter((r) => r.kind === 'call')
  }
}
