import type { LiveReport, WorstRow } from '../api/observability'

/** As piores sessões separadas: voz das calls (kind "call") e lives (o resto). */
export function splitWorst(rows: WorstRow[]): { lives: WorstRow[]; calls: WorstRow[] } {
  return {
    lives: rows.filter((r) => r.kind !== 'call'),
    calls: rows.filter((r) => r.kind === 'call')
  }
}

/** As piores de cada aba: as listas próprias do backend ou, num backend de antes, a lista única separada. */
export function worstLists(report: LiveReport): { lives: WorstRow[]; calls: WorstRow[] } {
  const split = splitWorst(report.worst)
  return { lives: report.worst_lives ?? split.lives, calls: report.worst_calls ?? split.calls }
}
