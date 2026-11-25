import type { AlertRow, AlertSeverity } from '../api/alerts'

// Textos e contas da aba Alertas.

export function severityLabel(severity: AlertSeverity): string {
  return severity === 'critico' ? 'Crítico' : 'Aviso'
}

/** "16 min", "1 h 20 min", "1 d 3 h", "40 s". */
function span(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return `${Math.floor(ms / 1000)} s`
  if (min < 60) return `${min} min`
  const [big, bigUnit, rest, restUnit] =
    min < 24 * 60 ? [Math.floor(min / 60), 'h', min % 60, 'min'] : [Math.floor(min / 1440), 'd', Math.floor(min / 60) % 24, 'h']
  return rest === 0 ? `${big} ${bigUnit}` : `${big} ${bigUnit} ${rest} ${restUnit}`
}

/** Quanto durou (ou "há X" se ainda está disparado); "—" num evento de uma vez. */
export function alertDuration(row: AlertRow, now: Date = new Date()): string {
  const start = Date.parse(row.started_at)
  if (row.ended_at === null) return `há ${span(now.getTime() - start)}`
  const ms = Date.parse(row.ended_at) - start
  return ms <= 0 ? '—' : span(ms)
}

/** Quantas vezes cada regra disparou no período, da mais frequente para a menos. */
export function recurrence(rows: AlertRow[]): { title: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const title = r.title || r.rule_id
    counts.set(title, (counts.get(title) ?? 0) + 1)
  }
  return [...counts].map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count)
}
