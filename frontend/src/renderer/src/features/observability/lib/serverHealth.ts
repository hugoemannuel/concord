import type { ServerReport } from '../api/serverReport'
import { numberLabel } from './reportFormat'

// Painel do servidor: números de resumo e rótulos. Puro.

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function bytesLabel(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${numberLabel(value, unit === 0 ? 0 : 1)} ${UNITS[unit]}`
}

/** Bytes por segundo em Mbps. */
export const mbps = (bps: number | null): number | null => (bps == null ? null : (bps * 8) / 1e6)

/** "há 10 min", "há 33 h", "há 5 dias". */
export function ageLabel(iso: string | null, now: number): string {
  if (!iso) return '—'
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `há ${hours} h`
  return `há ${Math.round(hours / 24)} dias`
}

const present = (values: (number | null)[]): number[] =>
  values.filter((v): v is number => v !== null)

const peak = (values: (number | null)[]): number | null => {
  const v = present(values)
  return v.length ? Math.max(...v) : null
}

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0)

export interface ApiSummary {
  perMinute: number | null
  errors5xx: number
  worstP95: number | null
  panics: number
  dbWaits: number
}

export function apiSummary(api: ServerReport['api']): ApiSummary {
  const minutes = sum(api.series.map((p) => p.minutes))
  return {
    perMinute: minutes ? sum(api.series.map((p) => p.requests)) / minutes : null,
    errors5xx: sum(api.series.map((p) => p.status_5xx)),
    worstP95: peak(api.series.map((p) => p.p95_ms)),
    panics: sum(api.series.map((p) => p.panics)),
    dbWaits: sum(api.series.map((p) => p.db_waits))
  }
}

/** A última linha tem mais de 3 min: o coletor parou (ou o backend caiu). */
export function isStale(minuteIso: string, now: number): boolean {
  return now - Date.parse(minuteIso) > 3 * 60000
}

// Limites dos avisos do bloco VPS (ver "Onde agir" em docs/OBSERVABILIDADE.md).
const LIMITS = { cpu: 90, steal: 10, memory: 90, disk: 85, backupHours: 26 }

export interface HostSummary {
  cpuPeak: number | null
  stealPeak: number | null
  warn: { cpu: boolean; steal: boolean; memory: boolean; disk: boolean; backup: boolean }
}

const over = (value: number | null | undefined, limit: number): boolean =>
  value != null && value >= limit

// Sem backup nenhum também é aviso (pasta errada ou o timer nunca rodou).
function backupLate(backupAt: string | null | undefined, now: number): boolean {
  return backupAt == null || now - Date.parse(backupAt) > LIMITS.backupHours * 3600000
}

export function hostSummary(host: ServerReport['host'], now: number): HostSummary {
  const latest = host.latest
  const cpuPeak = peak([...host.series.map((p) => p.cpu_max_pct), latest?.cpu_pct ?? null])
  const stealPeak = peak([...host.series.map((p) => p.steal_pct), latest?.steal_pct ?? null])
  return {
    cpuPeak,
    stealPeak,
    warn: {
      cpu: over(cpuPeak, LIMITS.cpu),
      steal: over(stealPeak, LIMITS.steal),
      memory: over(latest?.mem_used_pct, LIMITS.memory),
      disk: over(latest?.disk_used_pct, LIMITS.disk),
      backup: backupLate(latest?.backup_at, now)
    }
  }
}
